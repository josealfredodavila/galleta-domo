/* ============================================
   CARRUSEL 3D FULLSCREEN - Csariel's
   Ruta: /features/perfil/js/carrusel-3d-fullscreen.js
   Requiere en perfil.html el marcado con los IDs:
   carruselFullscreenOverlay, carruselFullscreenTrackWrap,
   carruselFullscreenTrack, carruselFullscreenDots,
   btnAbrirCarruselFullscreen, btnCerrarCarruselFullscreen
   ============================================ */

(function () {
    'use strict';

    var PALETA = [
        '#22d3a6', // Muro
        '#D4AF37', // Perfil
        '#a855f7', // Grupos
        '#00e5ff', // Contactos
        '#f59e0b', // Mercado
        '#ff3366', // Live
        '#3b82f6', // Internet
        '#f472b6'  // Videos
    ];

    var MODULOS = [
        { icon: '🤝', title: 'Muro',      desc: 'Publica, conecta y comparte con la comunidad.', url: '/features/muro/muro.html' },
        { icon: '👤', title: 'Perfil',    desc: 'Gestiona tu identidad, tokens y configuración.', url: '/features/perfil/perfil.html' },
        { icon: '👥', title: 'Grupos',    desc: 'Únete a comunidades y crea tus propios canales.', url: '/features/grupos/grupos.html' },
        { icon: '💬', title: 'Contactos', desc: 'Chatea y mantente en contacto con amigos.', url: '/features/mensajes/contactos.html' },
        { icon: '🛒', title: 'Mercado',   desc: 'Descubre tiendas y productos cerca de ti.', url: '/features/mercado/index.html' },
        { icon: '🔴', title: 'Live',      desc: 'Transmisiones en vivo y eventos exclusivos.', url: '/features/live/live.html' },
        { icon: '🌐', title: 'Internet',  desc: 'Conectividad eSIM y datos descentralizados.', url: '/features/internet/internet.html' },
        { icon: '🎬', title: 'Videos',    desc: 'Explora y comparte videos en la comunidad.', url: '/features/videos/videos.html' }
    ];

    var CARD_WIDTH = 260;
    var CARD_MARGIN = 15;
    var CARD_TOTAL = CARD_WIDTH + CARD_MARGIN * 2;
    var DRAG_UMBRAL = 6;      // px que hay que mover para considerar arrastre
    var RUEDA_BLOQUEO_MS = 350;

    var overlay = null;
    var trackWrap = null;
    var track = null;
    var dotsContainer = null;

    var totalCards = 0;
    var currentIndex = 0;
    var currentTransform = 0;

    var isDragging = false;
    var moved = false;
    var startX = 0;
    var startTransform = 0;
    var ruedaBloqueada = false;

    function abrirCarrusel() {
        if (!overlay) return;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(function () {
            centrarTarjeta(0, false);
        });
    }

    function cerrarCarrusel() {
        if (!overlay) return;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Desplazamiento que centra la tarjeta "index" en el ancho del contenedor
    function offsetCentrado(index) {
        return (trackWrap.offsetWidth / 2) - (CARD_WIDTH / 2) - (index * CARD_TOTAL);
    }

    function centrarTarjeta(index, animar) {
        if (!track || !trackWrap) return;

        index = Math.max(0, Math.min(totalCards - 1, index));
        currentIndex = index;
        currentTransform = offsetCentrado(index);

        track.classList.toggle('dragging', animar === false);
        track.style.transform = 'translateX(' + currentTransform + 'px)';

        track.querySelectorAll('.carrusel-fullscreen-card').forEach(function (card, i) {
            card.classList.toggle('active', i === index);
        });
        if (dotsContainer) {
            dotsContainer.querySelectorAll('.dot').forEach(function (dot, i) {
                dot.classList.toggle('active', i === index);
            });
        }
    }

    function siguiente() {
        centrarTarjeta(currentIndex < totalCards - 1 ? currentIndex + 1 : 0, true);
    }

    function anterior() {
        centrarTarjeta(currentIndex > 0 ? currentIndex - 1 : totalCards - 1, true);
    }

    // ==========================================
    // ARRASTRE (mouse y táctil)
    // ==========================================
    function punto(e) {
        return e.touches && e.touches.length ? e.touches[0] : e;
    }

    function iniciarDrag(e) {
        isDragging = true;
        moved = false;
        startX = punto(e).clientX;
        startTransform = currentTransform;
        track.classList.add('dragging');
    }

    function moverDrag(e) {
        if (!isDragging) return;
        var dx = punto(e).clientX - startX;
        if (Math.abs(dx) > DRAG_UMBRAL) moved = true;
        currentTransform = startTransform + dx;
        track.style.transform = 'translateX(' + currentTransform + 'px)';
    }

    function terminarDrag() {
        if (!isDragging) return;
        isDragging = false;
        var base = (trackWrap.offsetWidth / 2) - (CARD_WIDTH / 2);
        var indice = Math.round((base - currentTransform) / CARD_TOTAL);
        centrarTarjeta(indice, true);
    }

    // ==========================================
    // RUEDA DEL MOUSE (un paso por gesto)
    // ==========================================
    function manejarRueda(e) {
        e.preventDefault();
        if (ruedaBloqueada) return;

        var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 4) return;

        ruedaBloqueada = true;
        if (delta > 0) siguiente(); else anterior();
        setTimeout(function () { ruedaBloqueada = false; }, RUEDA_BLOQUEO_MS);
    }

    // ==========================================
    // TECLADO
    // ==========================================
    function manejarTeclado(e) {
        if (!overlay || !overlay.classList.contains('active')) return;
        if (e.key === 'ArrowRight') siguiente();
        if (e.key === 'ArrowLeft') anterior();
        if (e.key === 'Escape') cerrarCarrusel();
    }

    // ==========================================
    // CONSTRUCCIÓN
    // ==========================================
    function construirCarrusel() {
        track.innerHTML = '';
        dotsContainer.innerHTML = '';
        totalCards = MODULOS.length;

        MODULOS.forEach(function (mod, i) {
            var card = document.createElement('a');
            card.href = mod.url;
            card.className = 'carrusel-fullscreen-card';
            card.style.setProperty('--c', PALETA[i % PALETA.length]);

            var icono = document.createElement('div');
            icono.className = 'card-icon';
            icono.textContent = mod.icon;

            var titulo = document.createElement('div');
            titulo.className = 'card-title';
            titulo.textContent = mod.title;

            var desc = document.createElement('div');
            desc.className = 'card-desc';
            desc.textContent = mod.desc;

            card.appendChild(icono);
            card.appendChild(titulo);
            card.appendChild(desc);

            // Si el usuario arrastró, no navegar
            card.addEventListener('click', function (e) {
                if (moved) e.preventDefault();
            });

            track.appendChild(card);

            var dot = document.createElement('div');
            dot.className = 'dot';
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', function () {
                centrarTarjeta(i, true);
            });
            dotsContainer.appendChild(dot);
        });

        requestAnimationFrame(function () {
            centrarTarjeta(0, false);
        });
    }

    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    function init() {
        overlay = document.getElementById('carruselFullscreenOverlay');
        trackWrap = document.getElementById('carruselFullscreenTrackWrap');
        track = document.getElementById('carruselFullscreenTrack');
        dotsContainer = document.getElementById('carruselFullscreenDots');

        if (!overlay || !trackWrap || !track || !dotsContainer) {
            console.warn('[Carrusel Fullscreen] Faltan elementos en el HTML.');
            return;
        }

        construirCarrusel();

        var btnAbrir = document.getElementById('btnAbrirCarruselFullscreen');
        if (btnAbrir) btnAbrir.addEventListener('click', abrirCarrusel);

        var btnCerrar = document.getElementById('btnCerrarCarruselFullscreen');
        if (btnCerrar) btnCerrar.addEventListener('click', cerrarCarrusel);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) cerrarCarrusel();
        });

        trackWrap.addEventListener('mousedown', iniciarDrag);
        trackWrap.addEventListener('touchstart', iniciarDrag, { passive: true });
        document.addEventListener('mousemove', moverDrag);
        document.addEventListener('touchmove', moverDrag, { passive: true });
        document.addEventListener('mouseup', terminarDrag);
        document.addEventListener('touchend', terminarDrag);

        trackWrap.addEventListener('wheel', manejarRueda, { passive: false });
        document.addEventListener('keydown', manejarTeclado);

        window.addEventListener('resize', function () {
            centrarTarjeta(currentIndex, false);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.abrirCarruselFullscreen = abrirCarrusel;
    window.cerrarCarruselFullscreen = cerrarCarrusel;
})();
