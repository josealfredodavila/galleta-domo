/* ============================================
   CARRUSEL 3D HORIZONTAL - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js
   SCROLL LIBRE (sin stops)
   ============================================ */

(function () {
    'use strict';

    function initCarrusel3D() {
        const track = document.querySelector('.carrusel-3d-track');
        if (!track) return;

        const cards = track.querySelectorAll('.carrusel-3d-card');
        if (cards.length === 0) return;

        let ticking = false;

        function updateActiveCard() {
            const trackRect = track.getBoundingClientRect();
            const trackCenter = trackRect.left + trackRect.width / 2;

            let closestCard = null;
            let closestDistance = Infinity;

            cards.forEach(function (card) {
                const cardRect = card.getBoundingClientRect();
                const cardCenter = cardRect.left + cardRect.width / 2;
                const distance = Math.abs(trackCenter - cardCenter);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestCard = card;
                }
            });

            cards.forEach(function (card) {
                card.classList.remove('active');
            });

            if (closestCard) {
                closestCard.classList.add('active');
            }

            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                window.requestAnimationFrame(updateActiveCard);
                ticking = true;
            }
        }

        // Escuchar scroll del track
        track.addEventListener('scroll', onScroll, { passive: true });

        // Actualizar al cambiar tamaño
        window.addEventListener('resize', function () {
            onScroll();
        });

        // ✅ Al cargar, centrar la tarjeta activa (la del centro)
        setTimeout(function () {
            const activeCard = track.querySelector('.carrusel-3d-card.active');
            if (activeCard) {
                activeCard.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'center'
                });
            }
            setTimeout(updateActiveCard, 200);
        }, 300);

        // ✅ También actualiza cuando el usuario deja de tocar (para que la tarjeta
        //    que quedó cerca del centro se marque como activa)
        let touchEndTimer = null;
        track.addEventListener('touchend', function () {
            clearTimeout(touchEndTimer);
            touchEndTimer = setTimeout(updateActiveCard, 100);
        }, { passive: true });

        // ✅ Para mouse wheel
        let wheelTimer = null;
        track.addEventListener('wheel', function () {
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(updateActiveCard, 100);
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCarrusel3D);
    } else {
        initCarrusel3D();
    }
})();