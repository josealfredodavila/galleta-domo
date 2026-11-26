// ================================================================
// CSARIEL'S · VIDEOS · FEED (v3)
// ================================================================
// Carga y render del carrusel de videos.
// v3 · arranque rápido y precarga ligera:
// - El feed pinta en cuanto llegan los videos; las reacciones se
//   completan después sin repintar el carrusel.
// - Primera tarjeta sincrónica; el resto en lotes por frame.
// - Precarga por ventana: activo "auto", siguiente "metadata",
//   lejanos sin red (src removido) para no saturar memoria.
// - Estado inicial "Cargando…" y estado de error con reintento.
// - Pestaña Comunidad espera a que los contactos estén listos.
// - Mantiene pausa por cámara/visibilidad, scrub, señales y
//   recuperación básica de video.
// Lo que NO hace este módulo (vive en otros):
//   navegación y observador  → videos-navegacion.js (VA.navegacion)
//   audio y autoplay         → videos-audio.js      (VA.audio)
//   controles que se ocultan → videos-controles.js  (VA.controles)
//   reacciones (acciones)    → videos-reacciones.js (VA.reacciones)
// Expuesto en window.VideosApp.feed y window.cargarVideos.
// Requiere: config, utils, sesion.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.sesion) {
        console.error('[Videos] videos-feed.js requiere config, utils y sesion.');
        return;
    }
    if (VA.feed) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;
    var ICONO = U.ICONO;
    var RG = window.ReaccionesGlobal;

    /* ---------------- Estado interno (no público) ---------------- */

    // Pausa automática por cámara/visibilidad, independiente de la pausa manual.
    var pausadoPorCamara = false;
    // Reintentos por <video> para no caer en bucles.
    var MAX_REINTENTOS_RED = 2;
    var reintentosPorVideo = new WeakMap();

    // Carga de videos en curso (evita consultas duplicadas).
    var cargaEnCurso = null;
    var cargaPendiente = false;

    // Ciclo de render: la promesa se resuelve cuando el carrusel quedó pintado.
    var renderPromise = Promise.resolve();
    var renderResolve = null;

    // Precarga por ventana.
    var ultimoIndiceVentana = -1;
    var TAM_LOTE_RENDER = 5;

    /* ---------------- Utilidades de programación ---------------- */

    function programar(fn) {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
        else setTimeout(fn, 0);
    }

    /* Inicia un ciclo de render y libera la promesa del anterior. */
    function nuevoCicloRender() {
        if (renderResolve) renderResolve();
        var resolver = null;
        renderPromise = new Promise(function (r) { resolver = r; });
        renderResolve = resolver;
        return resolver;
    }

    /* ---------------- Reacciones: cache de lectura ---------------- */

    function animarEmoji(el, emoji) {
        if (RG && el) RG.aplicarMotor(el, emoji);
    }

    /* Carga los votos de los videos visibles y arma los totales por emoji. */
    async function cargarReaccionesDeVideos(videoIds) {
        var sb = VA.cliente();
        if (!videoIds || videoIds.length === 0 || !sb) return;

        try {
            var result = await sb.from(CONFIG.TABLA_VIDEOS_LIKES)
                .select('video_id, usuario_id, tipo')
                .in('video_id', videoIds);
            if (result.error) return;

            S.likeCache.clear();
            S.reaccionesCache.clear();

            (result.data || []).forEach(function (r) {
                var tipo = RG ? RG.normalizar(r.tipo) : (r.tipo || VA.reaccionPorDefecto());
                S.likeCache.set(r.video_id + '_' + r.usuario_id, tipo);

                if (!S.reaccionesCache.has(r.video_id)) {
                    S.reaccionesCache.set(r.video_id, { totales: {} });
                }
                var obj = S.reaccionesCache.get(r.video_id);
                obj.totales[tipo] = (obj.totales[tipo] || 0) + 1;
            });
        } catch (e) {
            console.warn('[Videos] Error cargando reacciones:', e);
        }
    }

    /* Total de reacciones de un video. Si no hay caché, usa el contador de la fila. */
    function contarReacciones(videoId, respaldo) {
        var r = S.reaccionesCache.get(videoId);
        if (!r) return respaldo || 0;
        var total = 0;
        Object.keys(r.totales).forEach(function (k) { total += r.totales[k]; });
        return total;
    }

    /* Mi reacción actual a un video (o null). */
    function miReaccion(videoId) {
        if (!S.sessionUser) return null;
        return S.likeCache.get(videoId + '_' + S.sessionUser.id) || null;
    }

    /* Actualiza contador, emoji y barra de las tarjetas ya pintadas,
       sin volver a construir el carrusel. */
    function refrescarReacciones() {
        document.querySelectorAll('#videosContainer .video-card').forEach(function (card) {
            var id = card.dataset.videoId;
            if (!id) return;

            var miTipo = miReaccion(id);
            var total = contarReacciones(id, 0);

            var cont = document.getElementById('likeCount-' + id);
            if (cont) cont.textContent = U.formatContador(total);

            var btn = card.querySelector('.reac-btn');
            if (btn) {
                var actual = btn.querySelector('.reac-emoji');
                var actualTxt = actual ? actual.textContent : '';
                if ((miTipo || '') !== actualTxt) {
                    btn.innerHTML = miTipo
                        ? '<span class="reac-emoji emoji-actual">' + U.escapeHTML(miTipo) + '</span>'
                        : ICONO.corazon;
                    var nuevo = btn.querySelector('.reac-emoji');
                    if (nuevo && miTipo) animarEmoji(nuevo, miTipo);
                }
            }

            card.querySelectorAll('.reac-op').forEach(function (op) {
                op.classList.toggle('activa', op.dataset.e === miTipo);
            });
        });
    }

    /* ---------------- Carga de videos ---------------- */

    /* Punto de entrada público. Si ya hay una carga en curso, pide otra al terminar. */
    function cargarVideos() {
        if (cargaEnCurso) {
            cargaPendiente = true;
            return cargaEnCurso;
        }
        cargaEnCurso = ejecutarCarga().then(function () {
            cargaEnCurso = null;
            if (cargaPendiente) {
                cargaPendiente = false;
                cargarVideos();
            }
        });
        return cargaEnCurso;
    }

    /* Consulta con join al autor. Pinta en cuanto hay datos y completa
       las reacciones después. Si el join falla, reintenta sin él. */
    async function ejecutarCarga() {
        var sb = VA.cliente();
        if (!sb) {
            S.errorCarga = !S.videosPublicados.length;
            renderFeed();
            return;
        }

        var columnasConAutor = 'id, titulo, descripcion, url_video, url_miniatura, usuario_id, reproducciones, likes, comentarios, created_at, sonido_id, sonido_nombre, ubicacion_nombre, latitud, longitud, usuarios:usuario_id (id, nombre, handle, avatar_url)';
        var columnasBasicas = 'id, titulo, descripcion, url_video, url_miniatura, usuario_id, reproducciones, likes, comentarios, created_at';

        try {
            var result = await sb.from(CONFIG.TABLA_VIDEOS)
                .select(columnasConAutor)
                .eq('estado', 'publicado')
                .eq('es_borrador', false)
                .order('created_at', { ascending: false })
                .limit(CONFIG.LIMITE_VIDEOS_FEED);

            var data;
            if (result.error) {
                var respaldo = await sb.from(CONFIG.TABLA_VIDEOS)
                    .select(columnasBasicas)
                    .eq('estado', 'publicado')
                    .eq('es_borrador', false)
                    .order('created_at', { ascending: false })
                    .limit(CONFIG.LIMITE_VIDEOS_FEED);
                if (respaldo.error) throw respaldo.error;
                data = respaldo.data;
            } else {
                data = result.data;
            }

            S.videosPublicados = data || [];
            S.errorCarga = false;
        } catch (e) {
            console.error('[Videos] Error al cargar:', e);
            S.errorCarga = !S.videosPublicados.length;
            renderFeed();
            return;
        }

        // Pinta primero; las reacciones llegan después sin repintar el carrusel.
        renderFeed();

        var ids = S.videosPublicados.map(function (v) { return v.id; });
        cargarReaccionesDeVideos(ids).then(function () {
            refrescarReacciones();
        });
    }

    /* ---------------- Filtros / pestañas ---------------- */

    // Normaliza nombres de pestaña antiguos y nuevos.
    function normalizarPestana(p) {
        switch (p) {
            case 'para_ti':
            case 'explorando':
                return 'explorando';
            case 'siguiendo':
            case 'comunidad':
                return 'comunidad';
            case 'puebla':
                return 'puebla';
            default:
                return p || 'explorando';
        }
    }

    function filtrarVideos() {
        var lista = S.videosPublicados.slice();
        var pestana = normalizarPestana(S.pestanaActiva);

        if (pestana === 'comunidad') {
            lista = lista.filter(function (v) { return VA.sesion.sigoAlAutor(v.usuario_id); });
        } else if (pestana === 'puebla') {
            lista = lista.filter(function (v) {
                var lugar = U.normalizarTexto(v.ubicacion_nombre);
                return CONFIG.PUEBLA_LUGARES.some(function (p) { return lugar.indexOf(p) !== -1; });
            });
        }

        if (S.textoBusqueda) {
            var t = U.normalizarTexto(S.textoBusqueda);
            lista = lista.filter(function (v) {
                var autor = v.usuarios || {};
                var campos = [v.titulo, v.descripcion, autor.handle, autor.nombre]
                    .map(U.normalizarTexto).join(' ');
                return campos.indexOf(t) !== -1;
            });
        }
        return lista;
    }

    function mensajeVacio() {
        if (S.textoBusqueda) return 'Sin resultados para tu búsqueda.';
        var pestana = normalizarPestana(S.pestanaActiva);
        if (pestana === 'comunidad') {
            return 'Aún no tienes contactos activos. Cuando te conectes con alguien, sus videos aparecerán aquí.';
        }
        if (pestana === 'puebla') {
            return 'Todavía no hay videos publicados desde Puebla.';
        }
        return "Sé el primero en compartir un video en Csariel's.";
    }

    /* Cambia de pestaña y repinta. Lo llama videos-navegacion.js. */
    function setPestana(nueva) {
        var norm = normalizarPestana(nueva);
        if (norm === normalizarPestana(S.pestanaActiva)) return;
        S.pestanaActiva = norm;
        renderFeed();
    }

    /* Cambia el texto de búsqueda y repinta. */
    function setBusqueda(texto) {
        S.textoBusqueda = String(texto || '').trim();
        renderFeed();
    }

    /* ---------------- Estados visibles del carrusel ---------------- */

    function obtenerContenedor() {
        return document.getElementById('videosContainer');
    }

    /* Estado de "cargando": se muestra al entrar, antes de tener datos. */
    function mostrarCargando() {
        var c = obtenerContenedor();
        if (!c || c.querySelector('.video-card')) return;
        c.classList.add('vacio');
        c.innerHTML = '<div class="empty-state"><span class="icon">◈</span><h3>Cargando videos…</h3></div>';
        pintarIndicador(0);
    }

    /* Estado de error con botón para reintentar. */
    function pintarError() {
        var c = obtenerContenedor();
        if (!c) return;
        c.classList.add('vacio');
        c.innerHTML = '';

        var caja = document.createElement('div');
        caja.className = 'empty-state';
        caja.innerHTML = '<span class="icon">◈</span><h3>No se pudieron cargar los videos</h3>' +
            '<p>Revisa tu conexión e intenta de nuevo.</p>';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Reintentar';
        btn.style.cssText = 'margin-top:12px;padding:8px 16px;border-radius:999px;' +
            'border:1px solid rgba(212,175,55,.5);background:transparent;color:#D4AF37;' +
            'font-family:Orbitron,monospace;font-size:.7rem;cursor:pointer;';
        btn.addEventListener('click', function () { cargarVideos(); });

        caja.appendChild(btn);
        c.appendChild(caja);
        pintarIndicador(0);
    }

    /* ---------------- Indicador de posición ---------------- */

    function pintarIndicador(total) {
        var ind = document.getElementById('vfIndicador');
        if (!ind) return;
        if (total <= 1) { ind.innerHTML = ''; return; }

        var html = '';
        for (var i = 0; i < total; i++) {
            html += '<span class="vf-punto" data-i="' + i + '" style="width:' + (i === 0 ? 18 : 6) +
                'px;height:4px;border-radius:4px;background:' + (i === 0 ? '#fff' : 'rgba(255,255,255,.35)') + ';"></span>';
        }
        ind.innerHTML = html;
    }

    /* Marca el punto activo sin volver a pintar todos. */
    function actualizarIndicador() {
        document.querySelectorAll('#vfIndicador .vf-punto').forEach(function (p, i) {
            var activo = i === S.indiceActivo;
            p.style.width = (activo ? 18 : 6) + 'px';
            p.style.background = activo ? '#fff' : 'rgba(255,255,255,.35)';
        });
    }

    /* ---------------- Precarga por ventana ---------------- */

    /* Asigna src desde data-src solo si el video todavía no lo tiene. */
    function asegurarSrcLigero(video) {
        if (video.getAttribute('src')) return;
        var ds = video.getAttribute('data-src');
        if (ds) video.src = ds;
    }

    /* Activo: "auto". Siguiente: solo metadatos. Lejanos: sin red ni memoria. */
    function aplicarVentanaPrecarga(indiceActivo) {
        document.querySelectorAll('#videosContainer .video-card').forEach(function (card, i) {
            var video = card.querySelector('video');
            if (!video) return;

            var dist = Math.abs(i - indiceActivo);

            if (dist === 0) {
                video.preload = 'auto';
                asegurarSrcLigero(video);
            } else if (dist === 1) {
                video.preload = 'metadata';
                asegurarSrcLigero(video);
            } else {
                if (!video.paused) {
                    try { video.pause(); } catch (_) {}
                }
                video.preload = 'none';
                if (video.getAttribute('src')) {
                    video.removeAttribute('src');
                    try { video.load(); } catch (_) {}
                }
            }
        });
    }

    /* Recalcula la ventana cuando el usuario desliza, una vez por frame. */
    function engancharVentanaPrecarga() {
        var c = obtenerContenedor();
        if (!c || c.dataset.precargaEnganchada === '1') return;
        c.dataset.precargaEnganchada = '1';

        var ticking = false;
        c.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            programar(function () {
                ticking = false;
                var ancho = c.clientWidth || 1;
                var idx = Math.round(c.scrollLeft / ancho);
                if (idx !== ultimoIndiceVentana) {
                    ultimoIndiceVentana = idx;
                    aplicarVentanaPrecarga(idx);
                }
            });
        }, { passive: true });
    }

    /* ---------------- Tarjeta ---------------- */

    function chipsDeVideo(v) {
        var chipSonido = v.sonido_nombre
            ? '<span class="chip chip-sonido">♪ ' + U.escapeHTML(v.sonido_nombre) + '</span>'
            : '';

        var chipUbic = '';
        if (v.ubicacion_nombre) {
            var lat = Number(v.latitud);
            var lng = Number(v.longitud);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                chipUbic = '<button type="button" class="chip chip-ubic btn-abrir-mapa" data-lat="' + lat +
                    '" data-lng="' + lng + '" data-nombre="' + U.escapeHTML(v.ubicacion_nombre) + '">◆ ' +
                    U.escapeHTML(v.ubicacion_nombre) + '</button>';
            } else {
                chipUbic = '<span class="chip chip-ubic" style="opacity:0.6;cursor:default;">◆ ' +
                    U.escapeHTML(v.ubicacion_nombre) + '</span>';
            }
        }
        return chipSonido + chipUbic;
    }

    function botonReaccion(videoId, miTipo) {
        var id = U.escapeHTML(videoId);
        return '<button type="button" class="acc-btn reac-btn" data-video-id="' + id + '" aria-label="Reaccionar">' +
            (miTipo ? '<span class="reac-emoji emoji-actual">' + U.escapeHTML(miTipo) + '</span>' : ICONO.corazon) +
            '</button>';
    }

    function crearVideoCard(v, indice) {
        var autor = v.usuarios || {};
        var id = U.escapeHTML(v.id);
        var miTipo = miReaccion(v.id);
        var total = contarReacciones(v.id, v.likes);
        var videoUrl = U.escapeHTML(U.safeAttr(v.url_video));
        var poster = (typeof v.url_miniatura === 'string' && v.url_miniatura.indexOf('https://') === 0)
            ? U.escapeHTML(v.url_miniatura) : '';
        var autorHandle = U.escapeHTML(autor.handle || 'usuario');
        var avatar = autor.avatar_url
            ? '<img src="' + U.safeAttr(autor.avatar_url) + '" alt="">'
            : U.escapeHTML((autor.nombre || '◈').charAt(0).toUpperCase());
        var titulo = U.escapeHTML(v.titulo || '');
        var desc = U.escapeHTML((v.descripcion || '').substring(0, 140));

        // Solo las dos primeras tarjetas piden metadatos; el resto no hace red.
        var preload = indice < 2 ? 'metadata' : 'none';

        var html = '';

        // Miniatura y botón de reproducir
        html += '<div class="thumbnail"><video preload="' + preload + '" playsinline webkit-playsinline data-src="' +
            videoUrl + '" data-cs-autoplay-ignorar="true"' + (poster ? ' poster="' + poster + '"' : '') + '></video>';
        html += '<div class="play-btn" role="button" aria-label="Reproducir">' + ICONO.play + '</div></div>';

        // Información del autor y del video
        html += '<div class="overlay-info">';
        html += '<div class="autor-row"><div class="autor-avatar">' + avatar + '</div>' +
            '<div class="autor-nombre">@' + autorHandle + '</div></div>';
        if (titulo) html += '<div class="titulo">' + titulo + '</div>';
        if (desc) html += '<div class="descripcion-corta">' + desc + '</div>';
        var chips = chipsDeVideo(v);
        if (chips) html += '<div class="chips">' + chips + '</div>';
        html += '</div>';

        // Barra lateral: reacciones, comentarios y menú
        html += '<div class="sidebar-acciones">';
        html += '<div class="acc-grupo">' + botonReaccion(v.id, miTipo);
        html += '<span class="acc-n" id="likeCount-' + id + '">' + U.formatContador(total) + '</span>';
        html += '<div class="reac-barra" id="reac-' + id + '">';
        VA.reacciones().forEach(function (e) {
            html += '<button type="button" class="reac-op' + (miTipo === e ? ' activa' : '') +
                '" data-e="' + e + '">' + e + '</button>';
        });
        html += '</div></div>';

        html += '<div class="acc-grupo"><button type="button" class="acc-btn com-btn" data-video-id="' + id +
            '" aria-label="Comentarios">' + ICONO.comentario + '</button>';
        html += '<span class="acc-n" id="comentCount-' + id + '">' + U.formatContador(v.comentarios || 0) + '</span></div>';

        html += '<div class="acc-grupo"><button type="button" class="acc-btn" data-accion="menu" aria-label="Más opciones">' +
            ICONO.mas + '</button></div>';
        html += '</div>';

        // Barra inferior: tiempos, vistas y progreso
        html += '<div class="barra-inferior"><div class="fila-tiempo">' +
            '<span class="tiempo-actual">0:00</span>' +
            '<span class="vistas">◈ ' + U.formatContador(v.reproducciones || 0) + ' vistas</span>' +
            '<span class="tiempo-total">0:00</span></div>';
        html += '<div class="barra-prog"><div class="fill"></div></div></div>';

        var card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = v.id;
        card.dataset.indice = String(indice);
        card.dataset.csDecorada = '1';
        card.innerHTML = html;

        enlazarMedios(card, v);
        enlazarBarraScrub(card);
        return card;
    }

    /* ---------------- Scrub táctil/pointer de la barra de tiempo ---------------- */

    /* Convierte coordenada X dentro de la barra a una proporción 0..1. */
    function calcularRatioDesdeX(barra, clientX) {
        var rect = barra.getBoundingClientRect();
        if (!rect || rect.width <= 0) return 0;
        var ratio = (clientX - rect.left) / rect.width;
        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;
        return ratio;
    }

    /* Aplica visual y lógicamente el segundo calculado. */
    function aplicarScrub(card, videoEl, barra, clientX) {
        var dur = videoEl.duration;
        if (!isFinite(dur) || dur <= 0) return;
        var ratio = calcularRatioDesdeX(barra, clientX);
        var segundos = ratio * dur;

        var fill = card.querySelector('.barra-prog .fill');
        if (fill) fill.style.width = (ratio * 100) + '%';
        var tActual = card.querySelector('.tiempo-actual');
        if (tActual) tActual.textContent = U.formatearTiempo(segundos);

        try {
            videoEl.currentTime = segundos;
        } catch (e) {
            // Algunos navegadores rechazan si aún no hay metadata; se ignora.
        }
    }

    function enlazarBarraScrub(card) {
        var barra = card.querySelector('.barra-prog') || card.querySelector('.barra-inferior');
        var videoEl = card.querySelector('video');
        if (!barra || !videoEl) return;

        // Área táctil cómoda: el .barra-inferior envuelve a .barra-prog.
        var zonaTactil = card.querySelector('.barra-inferior') || barra;
        zonaTactil.style.touchAction = 'pan-y';

        var arrastrando = false;
        var pointerId = null;

        function iniciar(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            arrastrando = true;
            pointerId = e.pointerId;
            card.dataset.scrubbing = '1';
            zonaTactil.style.touchAction = 'none';
            try { zonaTactil.setPointerCapture(pointerId); } catch (_) {}
            aplicarScrub(card, videoEl, barra, e.clientX);
            e.preventDefault();
        }

        function mover(e) {
            if (!arrastrando || e.pointerId !== pointerId) return;
            aplicarScrub(card, videoEl, barra, e.clientX);
            e.preventDefault();
        }

        function terminar(e) {
            if (!arrastrando) return;
            if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
            arrastrando = false;
            pointerId = null;
            delete card.dataset.scrubbing;
            zonaTactil.style.touchAction = 'pan-y';
            if (e) {
                try { zonaTactil.releasePointerCapture(e.pointerId); } catch (_) {}
            }
        }

        zonaTactil.addEventListener('pointerdown', iniciar, { passive: false });
        zonaTactil.addEventListener('pointermove', mover, { passive: false });
        zonaTactil.addEventListener('pointerup', terminar);
        zonaTactil.addEventListener('pointercancel', terminar);
        zonaTactil.addEventListener('pointerleave', function (e) {
            if (arrastrando && e.pointerType === 'mouse') terminar(e);
        });
    }

    /* ---------------- Movimiento de emojis y eventos del <video> ---------------- */

    function enlazarMedios(card, v) {
        card.querySelectorAll('.reac-op').forEach(function (op) { animarEmoji(op, op.dataset.e); });
        var emojiBtn = card.querySelector('.reac-emoji');
        if (emojiBtn) animarEmoji(emojiBtn, miReaccion(v.id));

        var videoEl = card.querySelector('video');
        videoEl.muted = false;
        videoEl.volume = 1;
        videoEl.removeAttribute('muted');

        // timeupdate: se respeta si el usuario está haciendo scrub.
        videoEl.addEventListener('timeupdate', function () {
            if (card.dataset.scrubbing === '1') return;
            if (!videoEl.duration) return;
            var fill = card.querySelector('.barra-prog .fill');
            if (fill) fill.style.width = (videoEl.currentTime / videoEl.duration * 100) + '%';
            var tActual = card.querySelector('.tiempo-actual');
            if (tActual) tActual.textContent = U.formatearTiempo(videoEl.currentTime);
        });

        videoEl.addEventListener('loadedmetadata', function () {
            var tTotal = card.querySelector('.tiempo-total');
            if (tTotal) tTotal.textContent = U.formatearTiempo(videoEl.duration);
            reintentosPorVideo.set(videoEl, 0);
        });

        videoEl.addEventListener('playing', function () {
            card.classList.add('playing');
            if (VA.controles) VA.controles.mostrarControles(card);
            emitirSenal('playing', v.id);
        });

        videoEl.addEventListener('play', function () {
            card.classList.add('playing');
            emitirSenal('play', v.id);
        });

        videoEl.addEventListener('pause', function () {
            card.classList.remove('playing');
            if (VA.controles) VA.controles.ocultarControlesYa(card);
            emitirSenal('pause', v.id);
        });

        videoEl.addEventListener('ended', function () {
            card.classList.remove('playing');
            emitirSenal('ended', v.id);
            if (!VA.audio || !VA.audio.autoplayActivo()) return;
            if (VA.navegacion) VA.navegacion.irAVideo(S.indiceActivo + 1);
        });

        videoEl.addEventListener('error', function () {
            emitirSenal('error', v.id);
            intentarRecuperarVideo(videoEl, card, v);
        });

        videoEl.addEventListener('stalled', function () {
            emitirSenal('stalled', v.id);
            intentarRecuperarVideo(videoEl, card, v);
        });
    }

    /* Señal ligera de reproducción: evento DOM que otros módulos pueden escuchar. */
    function emitirSenal(tipo, videoId) {
        try {
            var detalle = { tipo: tipo, videoId: videoId, t: Date.now() };
            var ev;
            if (typeof CustomEvent === 'function') {
                ev = new CustomEvent('cs:video-senal', { detail: detalle });
            } else {
                ev = document.createEvent('CustomEvent');
                ev.initCustomEvent('cs:video-senal', false, false, detalle);
            }
            window.dispatchEvent(ev);
        } catch (_) { /* silencioso */ }
    }

    /* Recuperación básica: preserva currentTime y reintenta cargar con límite. */
    function intentarRecuperarVideo(videoEl, card, v) {
        var intentos = reintentosPorVideo.get(videoEl) || 0;
        if (intentos >= MAX_REINTENTOS_RED) return;

        var t = videoEl.currentTime || 0;
        var src = videoEl.getAttribute('data-src') || v.url_video;
        if (!src) return;

        reintentosPorVideo.set(videoEl, intentos + 1);

        setTimeout(function () {
            try {
                videoEl.src = src;
                videoEl.load();
                var reanudarEn = function () {
                    try { videoEl.currentTime = t; } catch (_) {}
                    videoEl.removeEventListener('loadedmetadata', reanudarEn);
                };
                videoEl.addEventListener('loadedmetadata', reanudarEn);
            } catch (e) {
                console.warn('[Videos] No se pudo reintentar carga:', e);
            }
        }, 500 + intentos * 700);
    }

    /* ---------------- Render del carrusel ---------------- */

    function finalizarRender(lista, contenedor, version, resolver) {
        if (version !== S.renderVersion) {
            resolver();
            return;
        }
        contenedor.scrollLeft = 0;
        ultimoIndiceVentana = 0;
        aplicarVentanaPrecarga(0);
        engancharVentanaPrecarga();
        U.aplicarI18N(contenedor);
        if (VA.navegacion) VA.navegacion.observarCarrusel();
        pintarIndicador(lista.length);
        resolver();
    }

    function renderFeed() {
        var version = ++S.renderVersion;
        var resolver = nuevoCicloRender();
        var contenedor = obtenerContenedor();
        if (!contenedor) { resolver(); return; }

        if (S.observerCarrusel) {
            S.observerCarrusel.disconnect();
            S.observerCarrusel = null;
        }
        S.cardActiva = null;
        S.indiceActivo = 0;
        ultimoIndiceVentana = -1;

        // Comunidad: no mostrar "vacío" mientras los contactos siguen cargando.
        if (normalizarPestana(S.pestanaActiva) === 'comunidad' && !S.contactosListos && !S.textoBusqueda) {
            mostrarCargando();
            resolver();
            return;
        }

        // Sin datos y con error: mensaje con reintento, no "No hay videos".
        if (S.errorCarga && !S.videosPublicados.length) {
            pintarError();
            resolver();
            return;
        }

        var lista = filtrarVideos();
        contenedor.innerHTML = '';

        if (!lista.length) {
            contenedor.classList.add('vacio');
            contenedor.innerHTML = '<div class="empty-state"><span class="icon">◈</span><h3>' +
                U.escapeHTML(mensajeVacio()) + '</h3></div>';
            pintarIndicador(0);
            resolver();
            return;
        }

        contenedor.classList.remove('vacio');

        // Primera tarjeta de inmediato: el video activo aparece sin esperar al resto.
        contenedor.appendChild(crearVideoCard(lista[0], 0));

        if (lista.length === 1) {
            finalizarRender(lista, contenedor, version, resolver);
            return;
        }

        var i = 1;
        function pintarLote() {
            if (version !== S.renderVersion) { resolver(); return; }
            var fin = Math.min(i + TAM_LOTE_RENDER, lista.length);
            for (; i < fin; i++) {
                contenedor.appendChild(crearVideoCard(lista[i], i));
            }
            if (i < lista.length) {
                programar(pintarLote);
            } else {
                finalizarRender(lista, contenedor, version, resolver);
            }
        }
        programar(pintarLote);
    }

    /* Promesa que se resuelve cuando el carrusel actual terminó de pintarse. */
    function esperarRender() {
        return renderPromise;
    }

    /* Busca un video por id en la lista cargada (para el deep link ?v=). */
    function buscarVideoPorId(id) {
        return S.videosPublicados.find(function (x) { return x.id === id; }) || null;
    }

    /* Inserta un video recién publicado al inicio y repinta el carrusel. */
    function insertarVideoArriba(nuevoVideo) {
        if (!nuevoVideo || !nuevoVideo.id) return;
        var existente = S.videosPublicados.findIndex(function (x) { return x.id === nuevoVideo.id; });
        if (existente !== -1) S.videosPublicados.splice(existente, 1);
        S.videosPublicados.unshift(nuevoVideo);
        renderFeed();
    }

    /* ---------------- Pausa/reanudación automática ---------------- */

    /* Devuelve el <video> de la tarjeta activa, si lo hay. */
    function videoActivo() {
        var card = S.cardActiva;
        if (card && card.querySelector) {
            var v = card.querySelector('video');
            if (v) return v;
        }
        return null;
    }

    /* Pausa automática: no toca la pausa manual del usuario. */
    function pausarPorCamara() {
        var video = videoActivo();
        if (!video) return;
        if (!video.paused && !video.ended) {
            pausadoPorCamara = true;
            try { video.pause(); } catch (_) {}
        }
    }

    /* Reanuda solo si la pausa fue automática. */
    function reanudarPorCamara() {
        if (!pausadoPorCamara) return;
        var video = videoActivo();
        pausadoPorCamara = false;
        if (!video) return;
        if (video.paused) {
            var p = video.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
        }
    }

    /* Hook manual: el usuario pausó/reprodujo → cancelar pausa automática. */
    function marcarPausaManual() {
        pausadoPorCamara = false;
    }

    /* ---------------- Listeners globales de visibilidad/cámara ---------------- */

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) pausarPorCamara();
            else reanudarPorCamara();
        });
    }

    window.addEventListener('pagehide', function () { pausarPorCamara(); });
    window.addEventListener('pageshow', function () { reanudarPorCamara(); });

    window.addEventListener('cs:camara-abrir', function () { pausarPorCamara(); });
    window.addEventListener('cs:camara-cerrar', function () { reanudarPorCamara(); });
    window.addEventListener('cs:grabacion-iniciar', function () { pausarPorCamara(); });
    window.addEventListener('cs:grabacion-detener', function () { reanudarPorCamara(); });

    /* ---------------- API pública ---------------- */

    VA.feed = {
        cargarVideos: cargarVideos,
        renderFeed: renderFeed,
        filtrarVideos: filtrarVideos,
        setPestana: setPestana,
        setBusqueda: setBusqueda,
        pestanaActual: function () { return normalizarPestana(S.pestanaActiva); },
        contarReacciones: contarReacciones,
        miReaccion: miReaccion,
        cargarReaccionesDeVideos: cargarReaccionesDeVideos,
        refrescarReacciones: refrescarReacciones,
        mostrarCargando: mostrarCargando,
        esperarRender: esperarRender,
        aplicarVentanaPrecarga: aplicarVentanaPrecarga,
        pintarIndicador: pintarIndicador,
        actualizarIndicador: actualizarIndicador,
        crearVideoCard: crearVideoCard,
        buscarVideoPorId: buscarVideoPorId,
        insertarVideoArriba: insertarVideoArriba,
        pausarPorCamara: pausarPorCamara,
        reanudarPorCamara: reanudarPorCamara,
        marcarPausaManual: marcarPausaManual
    };

    /* Contrato global: lo usan videos-publicar.js y videos-init.js. */
    window.cargarVideos = cargarVideos;
})();