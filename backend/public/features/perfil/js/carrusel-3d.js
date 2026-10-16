/* ============================================
   CARRUSEL 3D HORIZONTAL - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js
   Scroll libre. Cada tarjeta se inclina y escala según
   qué tan cerca esté del centro; la más cercana queda activa.
   Expone window.carrusel3D.refrescar() para registrar tarjetas
   nuevas (por ejemplo, un anuncio) después de cargar.
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

    var MAX_ROTACION = 28;    // grados de inclinación en los extremos
    var PERDIDA_ESCALA = 0.1; // cuánto se reduce una tarjeta en los extremos
    var OPACIDAD_MIN = 0.55;

    var wrapper = null;
    var track = null;
    var dots = null;
    var cards = [];
    var puntos = [];
    var pendiente = false;

    function coleccionar() {
        return Array.prototype.slice.call(track.querySelectorAll('.carrusel-3d-card'));
    }

    // Solo asigna color a tarjetas que aún no tienen uno (las de anuncio lo traen propio)
    function asignarColores() {
        cards.forEach(function (card, i) {
            if (!card.style.getPropertyValue('--c')) {
                card.style.setProperty('--c', PALETA[i % PALETA.length]);
            }
        });
    }

    // Centra una tarjeta dentro del track (sin mover la página)
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

    function construirPuntos() {
        if (!dots) {
            dots = document.createElement('div');
            dots.className = 'carrusel-3d-dots';
            wrapper.appendChild(dots);
        }
        dots.innerHTML = '';
        cards.forEach(function (card, i) {
            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Ir al módulo ' + (i + 1));
            punto.addEventListener('click', function () {
                irACard(i, true);
            });
            dots.appendChild(punto);
        });
        puntos = Array.prototype.slice.call(dots.querySelectorAll('button'));
    }

    // Recalcula inclinación, escala, opacidad y tarjeta activa
    function actualizar() {
        pendiente = false;
        if (!cards.length) return;

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

    // Vuelve a leer las tarjetas del track (útil cuando se agrega o quita una)
    function refrescar() {
        if (!track) return;
        cards = coleccionar();
        asignarColores();
        construirPuntos();
        pedirActualizacion();
    }

    function init() {
        wrapper = document.querySelector('.carrusel-3d-wrapper');
        track = document.querySelector('.carrusel-3d-track');
        if (!wrapper || !track) return;

        cards = coleccionar();
        if (cards.length === 0) return;

        asignarColores();
        construirPuntos();

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

        window.carrusel3D = { refrescar: refrescar };
        window.dispatchEvent(new Event('carrusel3d:listo'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
