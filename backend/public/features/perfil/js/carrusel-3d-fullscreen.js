/* ============================================
   CARRUSEL 3D FULLSCREEN INFINITO - Csariel's
   Ruta: /features/perfil/js/carrusel-3d-fullscreen.js
   ============================================ */

(function () {
    'use strict';

    // ==========================================
    // DATOS DE LOS MÓDULOS DEL CARRUSEL
    // ==========================================
    var MODULOS = [
        { icon: '📈', title: 'Muro',       desc: 'Vende y compra Es.stoks en el mercado Polygon.', url: '/features/muro/muro.html' },
        { icon: '👤', title: 'Perfil',     desc: 'Gestiona tu identidad, tokens y configuración.', url: '/features/perfil/perfil.html' },
        { icon: '👥', title: 'Grupos',     desc: 'Únete a comunidades y crea tus propios canales.', url: '/features/grupos/grupos.html' },
        { icon: '💬', title: 'Contactos',  desc: 'Chatea y mantente en contacto con amigos.', url: '/features/mensajes/contactos.html' },
        { icon: '🛒', title: 'Mercado',    desc: 'Descubre tiendas y productos cerca de ti.', url: '/features/mercado/index.html' },
        { icon: '🔴', title: 'Live',       desc: 'Transmisiones en vivo y eventos exclusivos.', url: '/features/live/live.html' },
        { icon: '🌐', title: 'Internet',   desc: 'Conectividad eSIM y datos descentralizados.', url: '/features/internet/internet.html' },
        { icon: '🎬', title: 'Videos',     desc: 'Explora y comparte videos en la comunidad.', url: '/features/videos/videos.html' }
    ];

    var CARD_WIDTH = 260;
    var CARD_MARGIN = 15;
    var CARD_TOTAL = CARD_WIDTH + (CARD_MARGIN * 2);

    var overlay = null;
    var track = null;
    var trackWrap = null;
    var dotsContainer = null;

    var currentIndex = 0;
    var isDragging = false;
    var startX = 0;
    var startTransform = 0;
    var currentTransform = 0;
    var totalCards = 0;

    // ==========================================
    // ABRIR / CERRAR OVERLAY
    // ==========================================
    function abrirCarrusel() {
        if (!overlay) return;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reiniciar posición
        setTimeout(function () {
            centrarTarjeta(0, false);
        }, 100);
    }

    function cerrarCarrusel() {
        if (!overlay) return;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ==========================================
    // CENTRAR TARJETA
    // ==========================================
    function centrarTarjeta(index, animar) {
        if (!track) return;

        var wrapWidth = trackWrap.offsetWidth;
        var offset = (wrapWidth / 2) - (CARD_WIDTH / 2) - (index * CARD_TOTAL);

        currentTransform = offset;
        currentIndex = index;

        if (animar === false) {
            track.classList.add('dragging');
        } else {
            track.classList.remove('dragging');
        }

        track.style.transform = 'translateX(' + offset + 'px)';

        // Actualizar tarjeta activa y dots
        var cards = track.querySelectorAll('.carrusel-fullscreen-card');
        cards.forEach(function (card, i) {
            if (i === index) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        actualizarDots(index);
    }

    function actualizarDots(index) {
        if (!dotsContainer) return;
        var dots = dotsContainer.querySelectorAll('.dot');
        dots.forEach(function (dot, i) {
            if (i === index) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    // ==========================================
    // DRAG / TOUCH (SCROLL LIBRE SIN STOPS)
    // ==========================================
    function iniciarDrag(e) {
        if (e.target.closest('.carrusel-fullscreen-card')) {
            // No iniciar drag si toca directamente una tarjeta
            // (para permitir clic)
        }
        isDragging = true;
        startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        startTransform = currentTransform;
        track.classList.add('dragging');
    }

    function moverDrag(e) {
        if (!isDragging) return;
        var clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        var delta = clientX - startX;
        currentTransform = startTransform + delta;
        track.style.transform = 'translateX(' + currentTransform + 'px)';
    }

    function terminarDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        track.classList.remove('dragging');

        // Calcular índice más cercano
        var wrapWidth = trackWrap.offsetWidth;
        var centerOffset = currentTransform - ((wrapWidth / 2) - (CARD_WIDTH / 2));
        var indexFloat = -centerOffset / CARD_TOTAL;
        var indexCercano = Math.round(indexFloat);

        // Asegurar que esté en rango
        if (indexCercano < 0) indexCercano = 0;
        if (indexCercano >= totalCards) indexCercano = totalCards - 1;

        centrarTarjeta(indexCercano, true);
    }

    // ==========================================
    // SCROLL CON RUEDA DEL MOUSE
    // ==========================================
    function manejarWheel(e) {
        e.preventDefault();
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            // Scroll horizontal
            if (e.deltaX > 0) {
                siguiente();
            } else {
                anterior();
            }
        } else {
            // Scroll vertical
            if (e.deltaY > 0) {
                siguiente();
            } else {
                anterior();
            }
        }
    }

    function siguiente() {
        if (currentIndex < totalCards - 1) {
            centrarTarjeta(currentIndex + 1, true);
        } else {
            // Efecto infinito: volver al inicio con animación
            centrarTarjeta(0, true);
        }
    }

    function anterior() {
        if (currentIndex > 0) {
            centrarTarjeta(currentIndex - 1, true);
        } else {
            // Efecto infinito: ir al final
            centrarTarjeta(totalCards - 1, true);
        }
    }

    // ==========================================
    // TECLADO
    // ==========================================
    function manejarTeclado(e) {
        if (!overlay.classList.contains('active')) return;
        if (e.key === 'ArrowRight') siguiente();
        if (e.key === 'ArrowLeft') anterior();
        if (e.key === 'Escape') cerrarCarrusel();
    }

    // ==========================================
    // CONSTRUIR CARRUSEL
    // ==========================================
    function construirCarrusel() {
        if (!track) return;

        track.innerHTML = '';
        totalCards = MODULOS.length;

        MODULOS.forEach(function (mod, i) {
            var card = document.createElement('a');
            card.href = mod.url;
            card.className = 'carrusel-fullscreen-card';
            card.dataset.index = i;

            card.innerHTML =
                '<div class="card-icon">' + mod.icon + '</div>' +
                '<div class="card-title">' + mod.title + '</div>' +
                '<div class="card-desc">' + mod.desc + '</div>';

            // Click para navegar
            card.addEventListener('click', function (e) {
                // Solo navegar si no hubo drag
                if (isDragging) {
                    e.preventDefault();
                    return;
                }
                // La navegación normal del <a> se encarga
            });

            track.appendChild(card);
        });

        // Crear dots
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            MODULOS.forEach(function (mod, i) {
                var dot = document.createElement('div');
                dot.className = 'dot';
                if (i === 0) dot.classList.add('active');
                dotsContainer.appendChild(dot);
            });
        }

        // Centrar la primera tarjeta
        setTimeout(function () {
            centrarTarjeta(0, false);
        }, 200);
    }

    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    function init() {
        overlay = document.getElementById('carruselFullscreenOverlay');
        trackWrap = document.getElementById('carruselFullscreenTrackWrap');
        track = document.getElementById('carruselFullscreenTrack');
        dotsContainer = document.getElementById('carruselFullscreenDots');

        if (!overlay || !track || !trackWrap) {
            console.warn('[Carrusel Fullscreen] Elementos no encontrados');
            return;
        }

        construirCarrusel();

        // Botón abrir
        var btnAbrir = document.getElementById('btnAbrirCarruselFullscreen');
        if (btnAbrir) {
            btnAbrir.addEventListener('click', abrirCarrusel);
        }

        // Botón cerrar
        var btnCerrar = document.getElementById('btnCerrarCarruselFullscreen');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', cerrarCarrusel);
        }

        // Click en el fondo para cerrar
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                cerrarCarrusel();
            }
        });

        // Drag events
        trackWrap.addEventListener('mousedown', iniciarDrag);
        trackWrap.addEventListener('touchstart', iniciarDrag, { passive: true });
        document.addEventListener('mousemove', moverDrag);
        document.addEventListener('touchmove', moverDrag, { passive: true });
        document.addEventListener('mouseup', terminarDrag);
        document.addEventListener('touchend', terminarDrag);

        // Wheel
        trackWrap.addEventListener('wheel', manejarWheel, { passive: false });

        // Teclado
        document.addEventListener('keydown', manejarTeclado);

        // Reajustar al cambiar tamaño
        window.addEventListener('resize', function () {
            centrarTarjeta(currentIndex, false);
        });

        console.log('[Carrusel Fullscreen] ✅ Inicializado con', totalCards, 'módulos');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer globalmente
    window.abrirCarruselFullscreen = abrirCarrusel;
    window.cerrarCarruselFullscreen = cerrarCarrusel;

})();