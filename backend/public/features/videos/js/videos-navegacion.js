// ================================================================
// CSARIEL'S · VIDEOS · NAVEGACIÓN DEL CARRUSEL (v1)
// ================================================================
// Navegación y eventos del feed y de la cabecera.
// - Observa qué tarjeta está visible y la activa (≥ 60 % visible).
// - Reproduce la tarjeta activa, cuenta la vista y precarga la siguiente.
// - Avanza o retrocede entre videos (irAVideo).
// - Enruta los toques del feed: reacciones, comentarios, mapa, menú,
//   reproducir/pausar y mostrar controles.
// - Conecta la cabecera: buscar, pestañas, publicar, grabar y perfil.
// - Abre el video del enlace ?v=id cuando el feed ya cargó.
// Expuesto en window.VideosApp.navegacion.
// Requiere: config, utils, feed, audio, controles, hojas.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils || !VA.feed || !VA.audio || !VA.controles || !VA.hojas) {
        console.error('[Videos] videos-navegacion.js requiere config, utils, feed, audio, controles y hojas.');
        return;
    }
    if (VA.navegacion) return;

    var CONFIG = VA.CONFIG;
    var U = VA.utils;
    var S = VA.state;

    var UMBRAL_ACTIVA = 0.6;
    var RETARDO_BUSQUEDA_MS = 160;

    /* ----------------------------------------------------------------
       Vistas
       ---------------------------------------------------------------- */

    /* Cuenta una vista por video (una sola vez por sesión de página). */
    async function incrementarVista(videoId) {
        if (!videoId) return;
        var id = String(videoId);
        if (S.vistasContadas[id]) return;
        S.vistasContadas[id] = true;

        try {
            var sb = VA.cliente();
            if (sb) await sb.rpc(CONFIG.RPC_INCREMENTAR_REPRODUCCIONES, { video_id: id });
        } catch (e) {}
    }

    /* ----------------------------------------------------------------
       Observador del carrusel
       ---------------------------------------------------------------- */

    /* Observa cada tarjeta. Al estar ≥ 60 % visible, la activa; si sale, pausa. */
    function observarCarrusel() {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor || !('IntersectionObserver' in window)) return;

        S.observerCarrusel = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                var card = entrada.target;
                var video = card.querySelector('video');
                if (entrada.isIntersecting && entrada.intersectionRatio >= UMBRAL_ACTIVA) {
                    activarCard(card);
                } else if (video && !video.paused) {
                    video.pause();
                }
            });
        }, { root: contenedor, threshold: [0, UMBRAL_ACTIVA, 0.9] });

        contenedor.querySelectorAll('.video-card').forEach(function (c) {
            S.observerCarrusel.observe(c);
        });
    }

    /* Hace activa una tarjeta: indicador, precarga, reproducción y vista. */
    function activarCard(card) {
        if (card === S.cardActiva) return;

        S.cardActiva = card;
        S.indiceActivo = Number(card.dataset.indice) || 0;
        VA.feed.actualizarIndicador();
        VA.controles.cerrarBarrasReacciones();

        var video = card.querySelector('video');
        VA.audio.asegurarSrc(video);
        VA.audio.precargarSiguiente();

        if (VA.audio.autoplayActivo()) {
            VA.audio.reproducirVideoConSonido(video);
            incrementarVista(card.dataset.videoId);
        } else {
            VA.audio.pausarOtrosVideos(null);
            card.classList.remove('playing');
        }

        VA.controles.mostrarControles(card);
    }

    /* Desplaza el carrusel al video con ese índice. */
    function irAVideo(indice) {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor) return;
        var total = contenedor.querySelectorAll('.video-card').length;
        if (indice < 0 || indice >= total) return;
        contenedor.scrollTo({ left: indice * contenedor.clientWidth, behavior: 'smooth' });
    }

    /* Reproduce o pausa la tarjeta indicada (toque en el video). */
    function togglePlayCard(card) {
        if (!card) return;
        var video = card.querySelector('video');
        if (!video) return;

        if (video.paused) {
            VA.audio.reproducirVideoConSonido(video);
            incrementarVista(card.dataset.videoId);
        } else {
            video.pause();
        }
    }

    /* Abre un video por id (enlace ?v=). Devuelve true si estaba en la lista. */
    function irAVideoPorId(videoId) {
        var card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
        if (!card) return false;
        var indice = Number(card.dataset.indice) || 0;
        var contenedor = document.getElementById('videosContainer');
        if (contenedor) contenedor.scrollLeft = indice * contenedor.clientWidth;
        activarCard(card);
        return true;
    }

    /* ----------------------------------------------------------------
       Eventos del feed (delegados en el contenedor)
       ---------------------------------------------------------------- */

    function engancharFeed() {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor || contenedor.dataset.navEnganchado === '1') return;
        contenedor.dataset.navEnganchado = '1';

        // Cualquier toque en una tarjeta muestra sus controles
        contenedor.addEventListener('pointerdown', function (e) {
            var card = e.target.closest('.video-card');
            if (card) VA.controles.mostrarControles(card);
        });

        contenedor.addEventListener('click', function (e) {
            var t = e.target;

            var op = t.closest('.reac-op');
            if (op) {
                e.stopPropagation();
                var cardOp = op.closest('.video-card');
                if (VA.reacciones) VA.reacciones.elegirReaccion(cardOp.dataset.videoId, op.dataset.e);
                return;
            }

            var rb = t.closest('.reac-btn');
            if (rb) {
                e.stopPropagation();
                VA.controles.alternarBarraReacciones(rb.dataset.videoId);
                return;
            }

            var cb = t.closest('.com-btn');
            if (cb) {
                e.stopPropagation();
                if (VA.comentarios) VA.comentarios.abrirComentarios(cb.dataset.videoId);
                return;
            }

            var btnMapa = t.closest('.btn-abrir-mapa');
            if (btnMapa) {
                e.stopPropagation();
                if (VA.mapa) {
                    VA.mapa.abrirMapa(Number(btnMapa.dataset.lat), Number(btnMapa.dataset.lng), btnMapa.dataset.nombre);
                }
                return;
            }

            var acc = t.closest('[data-accion]');
            if (acc) {
                e.stopPropagation();
                var cardAcc = acc.closest('.video-card');
                if (acc.dataset.accion === 'menu' && VA.menu) {
                    VA.menu.abrirMenuVideo(cardAcc.dataset.videoId);
                }
                return;
            }

            var card = t.closest('.video-card');
            if (card) {
                VA.controles.mostrarControles(card);
                togglePlayCard(card);
            }
        });

        // Indicador: se actualiza al deslizar, sin esperar a IntersectionObserver
        var ticking = false;
        contenedor.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                ticking = false;
                var ancho = contenedor.clientWidth || 1;
                var idx = Math.round(contenedor.scrollLeft / ancho);
                if (idx !== S.indiceActivo) {
                    S.indiceActivo = idx;
                    VA.feed.actualizarIndicador();
                }
            });
        }, { passive: true });
    }

    /* ----------------------------------------------------------------
       Cabecera: buscar, pestañas, publicar, grabar y perfil
       ---------------------------------------------------------------- */

    function engancharCabecera() {
        var btnBuscar = document.getElementById('btnBuscar');
        var vfBuscar = document.getElementById('vfBuscar');
        var inputBuscar = document.getElementById('inputBuscar');

        if (btnBuscar && vfBuscar && inputBuscar && btnBuscar.dataset.navEnganchado !== '1') {
            btnBuscar.dataset.navEnganchado = '1';
            var buscarDeb = null;

            btnBuscar.addEventListener('click', function () {
                var abrir = !vfBuscar.classList.contains('show');
                vfBuscar.classList.toggle('show', abrir);
                if (abrir) {
                    setTimeout(function () { inputBuscar.focus(); }, 60);
                } else {
                    inputBuscar.value = '';
                    VA.feed.setBusqueda('');
                }
            });

            inputBuscar.addEventListener('input', function () {
                clearTimeout(buscarDeb);
                buscarDeb = setTimeout(function () {
                    VA.feed.setBusqueda(inputBuscar.value);
                }, RETARDO_BUSQUEDA_MS);
            });
        }

        document.querySelectorAll('.vf-tab').forEach(function (tab) {
            if (tab.dataset.navEnganchado === '1') return;
            tab.dataset.navEnganchado = '1';
            tab.addEventListener('click', function () {
                document.querySelectorAll('.vf-tab').forEach(function (t) {
                    t.classList.toggle('active', t === tab);
                });
                VA.feed.setPestana(tab.dataset.tab);
            });
        });

        var btnPublicar = document.getElementById('btnAbrirPublicar');
        if (btnPublicar && btnPublicar.dataset.navEnganchado !== '1') {
            btnPublicar.dataset.navEnganchado = '1';
            btnPublicar.addEventListener('click', function () {
                VA.hojas.abrirHoja('hojaPublicar');
            });
        }

        var btnCamara = document.getElementById('btnAbrirCamara');
        if (btnCamara && btnCamara.dataset.navEnganchado !== '1') {
            btnCamara.dataset.navEnganchado = '1';
            btnCamara.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.VideosCamara) window.VideosCamara.abrirCamara();
                else U.showToast('El módulo de cámara no está disponible', 'error');
            });
        }

        var tokenBadge = document.getElementById('tokenBadge');
        if (tokenBadge && tokenBadge.dataset.navEnganchado !== '1') {
            tokenBadge.dataset.navEnganchado = '1';
            tokenBadge.addEventListener('click', function () {
                window.location.href = CONFIG.RUTA_PERFIL;
            });
        }

        var btnFoto = document.getElementById('btnFotoVideo');
        if (btnFoto && btnFoto.dataset.navEnganchado !== '1') {
            btnFoto.dataset.navEnganchado = '1';
            btnFoto.addEventListener('click', function (e) {
                e.preventDefault();
                var input = document.getElementById('inputArchivoVideo');
                if (input) input.click();
            });
        }
    }

    /* ----------------------------------------------------------------
       Arranque: se llama una vez desde videos-init.js
       ---------------------------------------------------------------- */

    function iniciar() {
        engancharFeed();
        engancharCabecera();
    }

    VA.navegacion = {
        iniciar: iniciar,
        observarCarrusel: observarCarrusel,
        activarCard: activarCard,
        irAVideo: irAVideo,
        irAVideoPorId: irAVideoPorId,
        togglePlayCard: togglePlayCard,
        incrementarVista: incrementarVista
    };

    /* Contrato global: lo usa el HTML en el toque del video. */
    window.togglePlayCard = function (e, videoId) {
        var card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
        togglePlayCard(card);
    };
})();