/* ============================================
   CARRUSEL 3D - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js
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

        track.addEventListener('scroll', onScroll, { passive: true });

        window.addEventListener('resize', function () {
            onScroll();
        });

        // Centrar la tarjeta activa al cargar
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCarrusel3D);
    } else {
        initCarrusel3D();
    }
})();