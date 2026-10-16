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

    var MAX_ROTACION = 28;
    var PERDIDA_ESCALA = 0.1;
    var OPACIDAD_MIN = 0.55;

    var wrapper = null;
    var track = null;
    var dots = null;
    var cards = [];
    var puntos = [];
    var pendiente = false;
    var inicializado = false;
    var activoActual = -1;

    function obtenerWrapper() {
        return document.getElementById('carruselPerfilWrapper') ||
               document.querySelector('.carrusel-3d-wrapper:not(.carrusel-fullscreen-overlay *)');
    }

    function obtenerTrack() {
        return document.getElementById('carruselPerfilTrack') ||
               document.querySelector('.carrusel-3d-track:not(.carrusel-fullscreen-track)');
    }

    function coleccionar() {
        if (!track) return [];
        return Array.prototype.slice.call(track.querySelectorAll('.carrusel-3d-card'));
    }

    // Solo asigna color a tarjetas que aún no tienen uno (las de anuncio lo traen propio)
    function asignarColores() {
        var idx = 0;
        cards.forEach(function (card) {
            if (card.classList.contains('anuncio-card')) return;
            if (!card.style.getPropertyValue('--c')) {
                card.style.setProperty('--c', PALETA[idx % PALETA.length]);
            }
            idx++;
        });
    }

    function centroTrack() {
        if (!track) return 0;
        var trackRect = track.getBoundingClientRect();
        return trackRect.left + trackRect.width / 2;
    }

    function irACard(i, suave) {
        var card = cards[i];
        if (!card || !track) return;
        var trackRect = track.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();
        if (cardRect.width === 0) return; // aún sin layout
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
        var activo = activoActual >= 0 ? activoActual : 0;
        dots.innerHTML = '';
        cards.forEach(function (card, i) {
            var punto = document.createElement('button');
            punto.type = 'button';
            punto.setAttribute('aria-label', 'Ir al módulo ' + (i + 1));
            punto.addEventListener('click', function () {
                irACard(i, true);
            });
            if (i === activo) punto.classList.add('active');
            dots.appendChild(punto);
        });
        puntos = Array.prototype.slice.call(dots.querySelectorAll('button'));
    }

    function actualizar() {
        pendiente = false;
        if (!cards.length || !track) return;

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

        activoActual = mejor;

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

    function refrescar() {
        if (!track) {
            track = obtenerTrack();
            if (!track) return;
        }
        cards = coleccionar();
        if (cards.length === 0) return;
        asignarColores();
        construirPuntos();
        pedirActualizacion();
        window.dispatchEvent(new Event('carrusel3d:refrescar'));
    }

    // Intenta centrar la tarjeta inicial hasta que tenga layout real
    function irACardInicial(i, intentos) {
        intentos = intentos || 0;
        var card = cards[i];
        if (!card) return;
        var r = card.getBoundingClientRect();
        if (r.width > 0 || intentos > 30) {
            irACard(i, false);
            actualizar();
            return;
        }
        window.requestAnimationFrame(function () {
            irACardInicial(i, intentos + 1);
        });
    }

    function init() {
        wrapper = obtenerWrapper();
        track = obtenerTrack();
        if (!wrapper || !track) {
            // Reintentar en el siguiente frame si el DOM aún no está listo
            window.requestAnimationFrame(init);
            return;
        }
        if (inicializado) return;
        inicializado = true;

        cards = coleccionar();
        if (cards.length === 0) {
            window.requestAnimationFrame(init);
            return;
        }

        asignarColores();
        construirPuntos();

        track.addEventListener('scroll', pedirActualizacion, { passive: true });
        window.addEventListener('resize', pedirActualizacion);

        // Posición inicial: la tarjeta marcada como activa en el HTML
        var inicial = 0;
        cards.forEach(function (card, i) {
            if (card.classList.contains('active')) inicial = i;
        });
        activoActual = inicial;

        // Esperar un frame a que el layout esté estable, y reintentar si hace falta
        window.requestAnimationFrame(function () {
            irACardInicial(inicial, 0);
        });

        // Exponer API global inmediatamente
        window.carrusel3D = { refrescar: refrescar };
        window.dispatchEvent(new Event('carrusel3d:listo'));
    }

    // Exponer API antes de init para que anuncios-carrusel.js pueda llamarla
    window.carrusel3D = window.carrusel3D || { refrescar: function () {} };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();