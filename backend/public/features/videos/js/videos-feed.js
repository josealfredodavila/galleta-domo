// ================================================================
// CSARIEL'S · VIDEOS · FEED (v1)
// ================================================================
// Carga y render del carrusel de videos.
// - Consulta videos publicados (con join al autor) y sus reacciones.
// - Filtra por pestaña (Para ti / Siguiendo / Puebla) y búsqueda.
// - Pinta cada tarjeta y el indicador de posición.
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

    /* ---------------- Carga de videos ---------------- */

    /* Consulta con join al autor. Si el join falla, reintenta sin él. */
    async function cargarVideos() {
        try {
            var sb = VA.cliente();
            if (!sb) throw new Error('Cliente no disponible');

            var columnasConAutor = 'id, titulo, descripcion, url_video, url_miniatura, usuario_id, reproducciones, likes, comentarios, created_at, sonido_id, sonido_nombre, ubicacion_nombre, latitud, longitud, usuarios:usuario_id (id, nombre, handle, avatar_url)';
            var columnasBasicas = 'id, titulo, descripcion, url_video, url_miniatura, usuario_id, reproducciones, likes, comentarios, created_at';

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
                data = respaldo.data;
            } else {
                data = result.data;
            }

            S.videosPublicados = data || [];
            await cargarReaccionesDeVideos(S.videosPublicados.map(function (v) { return v.id; }));
            renderFeed();
        } catch (e) {
            console.error('[Videos] Error al cargar:', e);
            renderFeed();
        }
    }

    /* ---------------- Filtros ---------------- */

    function filtrarVideos() {
        var lista = S.videosPublicados.slice();

        if (S.pestanaActiva === 'siguiendo') {
            lista = lista.filter(function (v) { return VA.sesion.sigoAlAutor(v.usuario_id); });
        } else if (S.pestanaActiva === 'puebla') {
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
        if (S.pestanaActiva === 'siguiendo') return 'Aún no tienes contactos activos. Cuando te conectes con alguien, sus videos aparecerán aquí.';
        if (S.pestanaActiva === 'puebla') return 'Todavía no hay videos publicados desde Puebla.';
        return "Sé el primero en compartir un video en Csariel's.";
    }

    /* Cambia de pestaña y repinta. Lo llama videos-navegacion.js. */
    function setPestana(nueva) {
        if (nueva === S.pestanaActiva) return;
        S.pestanaActiva = nueva;
        renderFeed();
    }

    /* Cambia el texto de búsqueda y repinta. */
    function setBusqueda(texto) {
        S.textoBusqueda = String(texto || '').trim();
        renderFeed();
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

    /* ---------------- Tarjeta ---------------- */

    function chipsDeVideo(v) {
        var chipSonido = v.sonido_nombre
            ? '<span class="chip chip-sonido">♪ ' + U.escapeHTML(v.sonido_nombre) + '</span>'
            : '';

        var chipUbic = '';
        if (v.ubicacion_nombre) {
            var lat = v.latitud ? Number(v.latitud) : null;
            var lng = v.longitud ? Number(v.longitud) : null;
            if (lat && lng) {
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

        var html = '';

        // Miniatura y botón de reproducir
        html += '<div class="thumbnail"><video preload="metadata" playsinline webkit-playsinline data-src="' +
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
        return card;
    }

    /* Movimiento de los emojis y eventos del <video> de la tarjeta. */
    function enlazarMedios(card, v) {
        card.querySelectorAll('.reac-op').forEach(function (op) { animarEmoji(op, op.dataset.e); });
        var emojiBtn = card.querySelector('.reac-emoji');
        if (emojiBtn) animarEmoji(emojiBtn, miReaccion(v.id));

        var videoEl = card.querySelector('video');
        videoEl.muted = false;
        videoEl.volume = 1;
        videoEl.removeAttribute('muted');

        videoEl.addEventListener('timeupdate', function () {
            if (!videoEl.duration) return;
            var fill = card.querySelector('.barra-prog .fill');
            if (fill) fill.style.width = (videoEl.currentTime / videoEl.duration * 100) + '%';
            var tActual = card.querySelector('.tiempo-actual');
            if (tActual) tActual.textContent = U.formatearTiempo(videoEl.currentTime);
        });

        videoEl.addEventListener('loadedmetadata', function () {
            var tTotal = card.querySelector('.tiempo-total');
            if (tTotal) tTotal.textContent = U.formatearTiempo(videoEl.duration);
        });

        videoEl.addEventListener('play', function () {
            card.classList.add('playing');
            if (VA.controles) VA.controles.mostrarControles(card);
        });

        videoEl.addEventListener('pause', function () {
            card.classList.remove('playing');
            if (VA.controles) VA.controles.ocultarControlesYa(card);
        });

        videoEl.addEventListener('ended', function () {
            card.classList.remove('playing');
            if (!VA.audio || !VA.audio.autoplayActivo()) return;
            if (VA.navegacion) VA.navegacion.irAVideo(S.indiceActivo + 1);
        });
    }

    /* ---------------- Render del carrusel ---------------- */

    function renderFeed() {
        var version = ++S.renderVersion;
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor) return;

        if (S.observerCarrusel) {
            S.observerCarrusel.disconnect();
            S.observerCarrusel = null;
        }
        S.cardActiva = null;
        S.indiceActivo = 0;

        var lista = filtrarVideos();
        contenedor.innerHTML = '';

        if (!lista.length) {
            contenedor.classList.add('vacio');
            contenedor.innerHTML = '<div class="empty-state"><span class="icon">◈</span><h3>' +
                U.escapeHTML(mensajeVacio()) + '</h3></div>';
            pintarIndicador(0);
            return;
        }

        contenedor.classList.remove('vacio');
        lista.forEach(function (v, i) {
            contenedor.appendChild(crearVideoCard(v, i));
        });
        contenedor.scrollLeft = 0;

        // Si durante el render llegó otra versión, esta ya no es la vigente.
        if (version !== S.renderVersion) return;

        U.aplicarI18N(contenedor);
        if (VA.navegacion) VA.navegacion.observarCarrusel();
        pintarIndicador(lista.length);
    }

    /* Busca un video por id en la lista cargada (para el deep link ?v=). */
    function buscarVideoPorId(id) {
        return S.videosPublicados.find(function (x) { return x.id === id; }) || null;
    }

    VA.feed = {
        cargarVideos: cargarVideos,
        renderFeed: renderFeed,
        filtrarVideos: filtrarVideos,
        setPestana: setPestana,
        setBusqueda: setBusqueda,
        contarReacciones: contarReacciones,
        miReaccion: miReaccion,
        cargarReaccionesDeVideos: cargarReaccionesDeVideos,
        pintarIndicador: pintarIndicador,
        actualizarIndicador: actualizarIndicador,
        crearVideoCard: crearVideoCard,
        buscarVideoPorId: buscarVideoPorId
    };

    /* Contrato global: lo usan videos-publicar.js y videos-init.js. */
    window.cargarVideos = cargarVideos;
})();