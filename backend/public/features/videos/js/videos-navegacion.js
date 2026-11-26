// ================================================================
// CSARIEL'S · VIDEOS · NAVEGACIÓN DEL CARRUSEL (v2)
// ================================================================
// Navegación y eventos del feed y de la cabecera.
// - Observa qué tarjeta está visible y la activa (≥ 60 % visible),
//   eligiendo candidata con mayor visibilidad / más cercana al centro.
// - Reproducción exclusiva: nunca dos videos a la vez.
// - Ventana cercana: solo activo ± vecinos cargados en memoria.
// - Cuenta la vista y precarga la siguiente.
// - Avanza o retrocede entre videos (irAVideo).
// - Enruta los toques del feed respetando controles y barra de tiempo.
// - Conecta la cabecera: buscar, pestañas, publicar, grabar y perfil.
// - Coordina pausa con cámara y visibilidad sin tocar pausa manual.
// - Abre el video del enlace ?v=id cuando el feed ya cargó.
// Expuesto en window.VideosApp.navegacion y window.togglePlayCard.
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
    // Ventana de memoria: activo ± VENTANA_VECINOS.
    var VENTANA_VECINOS = 1;

    // Control de generación de activación: una carga vieja no debe activar
    // una tarjeta que ya no corresponde.
    var generacionActivacion = 0;
    // Solicitud rAF para el cálculo de "mejor tarjeta" del observer.
    var rafPendiente = null;
    // Últimas entradas vistas por el observer (para elegir la mejor).
    var entradasActuales = new Map();
    // Estado: ¿cámara abierta ahora?
    var camaraAbierta = false;
    // Estado: ¿pausamos por cámara/visibilidad? (distinto de pausa manual)
    var pausadoPorEntorno = false;
    // ¿La vista está oculta?
    var vistaOculta = false;

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

    /* Observa cada tarjeta. Al estar ≥ 60 % visible, la activa; si sale, pausa.
       Optimizado con rAF + generación para no activar tarjetas obsoletas. */
    function observarCarrusel() {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor || !('IntersectionObserver' in window)) return;

        // Evitar observadores duplicados.
        if (S.observerCarrusel) {
            S.observerCarrusel.disconnect();
            S.observerCarrusel = null;
        }
        entradasActuales.clear();

        S.observerCarrusel = new IntersectionObserver(function (entradas) {
            // Actualizar snapshot de visibilidad por tarjeta.
            entradas.forEach(function (entrada) {
                entradasActuales.set(entrada.target, entrada);

                // Si salió de vista y estaba reproduciendo, pausar.
                var video = entrada.target.querySelector('video');
                if (!entrada.isIntersecting && video && !video.paused) {
                    video.pause();
                }
            });

            // Evaluar cuál es la mejor tarjeta con rAF (una sola pasada por frame).
            if (rafPendiente) return;
            rafPendiente = requestAnimationFrame(function () {
                rafPendiente = null;
                evaluarMejorTarjeta();
            });
        }, { root: contenedor, threshold: [0, UMBRAL_ACTIVA, 0.9] });

        contenedor.querySelectorAll('.video-card').forEach(function (c) {
            S.observerCarrusel.observe(c);
        });
    }

    /* Elige la tarjeta candidata: mayor visibilidad, empate → más cercana al centro. */
    function evaluarMejorTarjeta() {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor) return;
        var centro = contenedor.scrollLeft + contenedor.clientWidth / 2;

        var mejor = null;
        var mejorRatio = 0;
        var mejorDist = Infinity;

        entradasActuales.forEach(function (entrada) {
            if (!entrada.isIntersecting) return;
            if (entrada.intersectionRatio < UMBRAL_ACTIVA) return;
            var card = entrada.target;
            var idx = Number(card.dataset.indice) || 0;
            var cardCentro = idx * contenedor.clientWidth + contenedor.clientWidth / 2;
            var dist = Math.abs(cardCentro - centro);

            if (entrada.intersectionRatio > mejorRatio + 0.001 ||
                (Math.abs(entrada.intersectionRatio - mejorRatio) <= 0.001 && dist < mejorDist)) {
                mejor = card;
                mejorRatio = entrada.intersectionRatio;
                mejorDist = dist;
            }
        });

        if (mejor && mejor !== S.cardActiva) {
            activarCard(mejor);
        }
    }

    /* Hace activa una tarjeta: indicador, precarga, reproducción y vista.
       Protegido con generación para no activar tarjetas obsoletas. */
    function activarCard(card) {
        if (!card) return;
        if (card === S.cardActiva) {
            // Aun así, revalidar reproducción exclusiva y ventana.
            aplicarVentanaDeMemoria(card);
            return;
        }

        var gen = ++generacionActivacion;

        S.cardActiva = card;
        S.indiceActivo = Number(card.dataset.indice) || 0;
        VA.feed.actualizarIndicador();
        VA.controles.cerrarBarrasReacciones();

        var video = card.querySelector('video');
        VA.audio.asegurarSrc(video);
        VA.audio.precargarSiguiente();

        // Reproducción exclusiva: pausar TODOS los demás videos del carrusel.
        pausarTodosMenos(video);

        // Gestión de memoria: solo cargar activo ± vecinos.
        aplicarVentanaDeMemoria(card);

        // Comprobar generación: si mientras tanto llegó otra activación, abortar.
        if (gen !== generacionActivacion) return;

        if (VA.audio.autoplayActivo() && !pausadoPorEntorno && !vistaOculta && !camaraAbierta) {
            VA.audio.reproducirVideoConSonido(video);
            incrementarVista(card.dataset.videoId);
        } else {
            card.classList.remove('playing');
        }

        VA.controles.mostrarControles(card);
    }

    /* Pausa todos los <video> del carrusel excepto el indicado. */
    function pausarTodosMenos(videoActivo) {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor) return;
        contenedor.querySelectorAll('.video-card video').forEach(function (v) {
            if (v === videoActivo) return;
            if (!v.paused) {
                try { v.pause(); } catch (_) {}
            }
            var card = v.closest('.video-card');
            if (card) card.classList.remove('playing');
        });
    }

    /* Mantiene cargados solo activo ± VENTANA_VECINOS. El resto se descarga
       (removeAttribute('src') + load()) conservando data-src y poster. */
    function aplicarVentanaDeMemoria(cardActiva) {
        var contenedor = document.getElementById('videosContainer');
        if (!contenedor) return;
        var cards = Array.prototype.slice.call(contenedor.querySelectorAll('.video-card'));
        var idxActivo = cards.indexOf(cardActiva);
        if (idxActivo < 0) return;

        var min = idxActivo - VENTANA_VECINOS;
        var max = idxActivo + VENTANA_VECINOS;

        cards.forEach(function (card, i) {
            var video = card.querySelector('video');
            if (!video) return;
            var dataSrc = video.getAttribute('data-src');
            var dentro = i >= min && i <= max;

            if (dentro) {
                // Restaurar src si se había liberado.
                if (!video.getAttribute('src') && dataSrc) {
                    video.setAttribute('src', dataSrc);
                    // Sin load() explícito para no forzar descarga de vecinos
                    // que no se van a reproducir; el navegador lo hace al necesitarlo.
                }
            } else {
                // Liberar memoria: pausar y quitar src conservando data-src y poster.
                if (!video.paused) {
                    try { video.pause(); } catch (_) {}
                }
                if (video.getAttribute('src')) {
                    video.removeAttribute('src');
                    try { video.load(); } catch (_) {}
                }
                card.classList.remove('playing');
            }
        });
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
            // Reproducción exclusiva.
            pausarTodosMenos(video);
            VA.audio.asegurarSrc(video);
            VA.audio.reproducirVideoConSonido(video);
            incrementarVista(card.dataset.videoId);
            // Un play manual invalida pausa por entorno.
            pausadoPorEntorno = false;
            if (VA.feed && VA.feed.marcarPausaManual) VA.feed.marcarPausaManual();
        } else {
            video.pause();
            // Un pause manual invalida pausa por entorno.
            pausadoPorEntorno = false;
            if (VA.feed && VA.feed.marcarPausaManual) VA.feed.marcarPausaManual();
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
       Coordinación con cámara y visibilidad
       ---------------------------------------------------------------- */

    /* Pausa por entorno (cámara/visibilidad): solo si estaba reproduciendo
       y no hay pausa manual del usuario. */
    function pausarPorEntorno() {
        var card = S.cardActiva;
        if (!card) return;
        var video = card.querySelector('video');
        if (!video) return;
        if (!video.paused && !video.ended) {
            pausadoPorEntorno = true;
            try { video.pause(); } catch (_) {}
            // Sincronizar con VA.feed para que también marque pausadoPorCamara.
            if (VA.feed && VA.feed.pausarPorCamara) VA.feed.pausarPorCamara();
        }
    }

    /* Reanuda por entorno: solo si `pausadoPorEntorno` está activo, no hay
       cámara abierta, la vista está visible y VA.audio permite autoplay. */
    function reanudarPorEntorno() {
        if (!pausadoPorEntorno) return;
        if (camaraAbierta) return;
        if (vistaOculta) return;
        var card = S.cardActiva;
        if (!card) { pausadoPorEntorno = false; return; }
        var video = card.querySelector('video');
        if (!video) { pausadoPorEntorno = false; return; }
        if (video.paused && VA.audio.autoplayActivo()) {
            VA.audio.asegurarSrc(video);
            VA.audio.reproducirVideoConSonido(video);
        }
        pausadoPorEntorno = false;
        if (VA.feed && VA.feed.reanudarPorCamara) VA.feed.reanudarPorCamara();
    }

    /* Marca eventos relacionados con cámara. */
    function marcarCamaraAbierta() {
        camaraAbierta = true;
        pausarPorEntorno();
    }

    function marcarCamaraCerrada() {
        camaraAbierta = false;
        reanudarPorEntorno();
    }

    /* Listeners globales (idempotentes). */
    var entornoEnganchado = false;
    function engancharEntorno() {
        if (entornoEnganchado) return;
        entornoEnganchado = true;

        document.addEventListener('visibilitychange', function () {
            vistaOculta = !!document.hidden;
            if (vistaOculta) pausarPorEntorno();
            else reanudarPorEntorno();
        });

        window.addEventListener('pagehide', function () {
            vistaOculta = true;
            pausarPorEntorno();
        });

        window.addEventListener('pageshow', function () {
            vistaOculta = false;
            reanudarPorEntorno();
        });

        // Eventos personalizados que el módulo de cámara/grabación puede emitir.
        window.addEventListener('cs:camara-abrir', marcarCamaraAbierta);
        window.addEventListener('cs:camara-cerrar', marcarCamaraCerrada);
        window.addEventListener('cs:grabacion-iniciar', marcarCamaraAbierta);
        window.addEventListener('cs:grabacion-detener', marcarCamaraCerrada);
    }

    /* ----------------------------------------------------------------
       Eventos del feed (delegados en el contenedor)
       ---------------------------------------------------------------- */

    /* Devuelve true si el target está dentro de una zona interactiva que
       NO debe disparar togglePlayCard. */
    function esZonaInteractiva(target) {
        if (!target || !target.closest) return false;
        var selectores = [
            '.barra-inferior',
            '.barra-prog',
            '.tiempo-actual',
            '.tiempo-total',
            '.reac-btn',
            '.reac-op',
            '.reac-barra',
            '.com-btn',
            '.btn-abrir-mapa',
            '[data-accion]',
            'a',
            'button',
            'input',
            'textarea',
            'select',
            'form',
            'label'
        ];
        for (var i = 0; i < selectores.length; i++) {
            if (target.closest(selectores[i])) return true;
        }
        return false;
    }

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

            // Excluir barra de tiempo y otras zonas interactivas.
            if (esZonaInteractiva(t)) return;

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
                // setPestana normaliza y repinta; pausamos por seguridad.
                pausarTodosMenos(null);
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
                // Marcar cámara abierta ANTES de abrir.
                marcarCamaraAbierta();
                if (window.VideosCamara && typeof window.VideosCamara.abrirCamara === 'function') {
                    window.VideosCamara.abrirCamara();
                } else {
                    U.showToast('El módulo de cámara no está disponible', 'error');
                    // Revertir si no se pudo abrir.
                    marcarCamaraCerrada();
                }
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
        engancharEntorno();
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
        incrementarVista: incrementarVista,
        // Auxiliares de entorno expuestos (útiles para otros módulos).
        pausarPorEntorno: pausarPorEntorno,
        reanudarPorEntorno: reanudarPorEntorno
    };

    /* Contrato global: lo usa el HTML en el toque del video. */
    window.togglePlayCard = function (e, videoId) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        var card = document.querySelector('.video-card[data-video-id="' + videoId + '"]');
        togglePlayCard(card);
    };
})();