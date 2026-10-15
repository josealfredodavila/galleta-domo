/* ============================================
   CARRUSEL 3D HORIZONTAL - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js
   Scroll libre. Cada tarjeta se inclina y escala según
   qué tan cerca esté del centro; la más cercana queda activa.
   ============================================ */

(function () {
    'use strict';

    // Color por módulo, en el mismo orden que las tarjetas del HTML
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

    var MAX_ROTACION = 28;   // grados de inclinación en los extremos
    var PERDIDA_ESCALA = 0.1; // cuánto se reduce una tarjeta en los extremos
    var OPACIDAD_MIN = 0.55;

    function init() {
        var wrapper = document.querySelector('.carrusel-3d-wrapper');
        var track = document.querySelector('.carrusel-3d-track');
        if (!wrapper || !track) return;

        var cards = Array.prototype.slice.call(track.querySelectorAll('.carrusel-3d-card'));
        if (cards.length === 0) return;

        // Color por tarjeta
        cards.forEach(function (card, i) {
            card.style.setProperty('--c', PALETA[i % PALETA.length]);
        });

        // Puntos de navegación
        var dots = document.createElement('div');
        dots.className = 'carrusel-3d-dots';
        cards.forEach(function (card, i) {
            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Ir al módulo ' + (i + 1));
            punto.addEventListener('click', function () {
                irACard(i, true);
            });
            dots.appendChild(punto);
        });
        wrapper.appendChild(dots);
        var puntos = Array.prototype.slice.call(dots.querySelectorAll('button'));

        // Centrar una tarjeta dentro del track (sin mover la página)
        function irACard(i, suave) {
            var card = cards[i];
            if (!card) return;
            var trackRect = track.getBoundingClientRect();
            var cardRect = card.getBoundingClientRect();
            var diferencia = (cardRect.left + cardRect.width / 2) - (trackRect.left + trackRect.width / 2);
            track.scrollTo({
                left: track.scrollLeft + diferencia,
                behavior: suave ? 'smooth' : 'auto'
            });
        }

        // Recalcula inclinación, escala, opacidad y tarjeta activa
        var pendiente = false;
        function actualizar() {
            pendiente = false;
            var trackRect = track.getBoundingClientRect();
            var centro = trackRect.left + trackRect.width / 2;

            var mejor = 0;
            var mejorDistancia = Infinity;

            cards.forEach(function (card, i) {
                var r = card.getBoundingClientRect();
                var distancia = (r.left + r.width / 2) - centro;
                var t = Math.max(-1, Math.min(1, distancia / (r.width + 14)));
                var lejania = Math.abs(t);

                card.style.transform =
                    'perspective(900px) rotateY(' + (-t * MAX_ROTACION).toFixed(2) + 'deg) ' +
                    'scale(' + (1 - lejania * PERDIDA_ESCALA).toFixed(3) + ')';
                card.style.opacity = (1 - lejania * (1 - OPACIDAD_MIN)).toFixed(3);

                if (Math.abs(distancia) < mejorDistancia) {
                    mejorDistancia = Math.abs(distancia);
                    mejor = i;
                }
            });

            cards.forEach(function (card, i) {
                card.classList.toggle('active', i === mejor);
            });
            puntos.forEach(function (punto, i) {
                punto.classList.toggle('active', i === mejor);
            });
        }

        function pedirActualizacion() {
            if (!pendiente) {
                pendiente = true;
                window.requestAnimationFrame(actualizar);
            }
        }

        track.addEventListener('scroll', pedirActualizacion, { passive: true });
        window.addEventListener('resize', pedirActualizacion);
        window.addEventListener('load', pedirActualizacion);

        // Posición inicial: la tarjeta marcada como activa en el HTML (Perfil)
        var inicial = 0;
        cards.forEach(function (card, i) {
            if (card.classList.contains('active')) inicial = i;
        });

        window.requestAnimationFrame(function () {
            irACard(inicial, false);
            actualizar();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
