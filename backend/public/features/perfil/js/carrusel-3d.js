/* ============================================
   CARRUSEL 3D HORIZONTAL - Csariel's
   Ruta: /features/perfil/js/carrusel-3d.js
   Scroll libre. Cada tarjeta se inclina y escala según
   qué tan cerca esté del centro; la más cercana queda activa.
   Expone window.carrusel3D.refrescar() para registrar tarjetas
   nuevas (por ejemplo, un anuncio) después de cargar.

   v2 · MARKETING
   - Paleta llamativa estilo Index (degradados vibrantes).
   - Los colores ya no representan secciones (Muro, Perfil…)
     sino anuncios promocionales.
   - Si no hay anuncios, se inyectan placeholders de marketing.
   ============================================ */

(function () {
    'use strict';

    // Paleta llamativa estilo Index (naranja→dorado, verde→cian,
    // morado→rosa, azul→turquesa, rojo→naranja, etc.)
    // Cada color es un par [inicio, fin] de degradado.
    var PALETA = [
        ['#ff3d00', '#ffc400'], // 0 · Naranja → Dorado
        ['#00c853', '#00e5ff'], // 1 · Verde → Cian
        ['#7c4dff', '#ff3cb4'], // 2 · Morado → Rosa
        ['#2962ff', '#00e5ff'], // 3 · Azul → Turquesa
        ['#d50000', '#ff6d00'], // 4 · Rojo → Naranja
        ['#ffd600', '#00e676'], // 5 · Amarillo → Verde
        ['#ff4081', '#7c4dff']  // 6 · Rosa → Violeta
    ];

    // Placeholders de marketing (cuando aún no hay anuncios reales)
    var PLACEHOLDERS = [
        {
            chip: 'MARKETING GRATIS',
            icon: '📣',
            title: 'ANÚNCIATE GRATIS',
            desc: 'Miles de personas te están buscando. Da a conocer tu negocio sin costo.',
            cta: 'Quiero anunciarme'
        },
        {
            chip: 'SIN COSTO',
            icon: '🚀',
            title: 'IMPULSA TU MARCA',
            desc: 'Llega a más clientes en el ecosistema Web3. Sin inversión inicial.',
            cta: 'Empezar gratis'
        },
        {
            chip: 'ESPACIO PREMIUM',
            icon: '💎',
            title: 'SÉ VISIBLE',
            desc: 'Tu marca merece brillar. Ocupa este espacio destacado gratis.',
            cta: 'Destacar ahora'
        },
        {
            chip: 'RED DE ANUNCIANTES',
            icon: '🌐',
            title: 'CRECE CON NOSOTROS',
            desc: 'Únete a la red de anunciantes de Sariel\'s. Publicar es gratis.',
            cta: 'Unirme'
        },
        {
            chip: 'TE ESTÁN BUSCANDO',
            icon: '🎯',
            title: 'HAZTE VER',
            desc: 'Clientes potenciales quieren encontrarte. Aparece sin pagar nada.',
            cta: 'Aparecer aquí'
        },
        {
            chip: '100% GRATUITO',
            icon: '📢',
            title: 'PROMOCIONA TU NEGOCIO',
            desc: 'Espacio premium para tu marca en la comunidad. Sin costo.',
            cta: 'Promocionar'
        },
        {
            chip: 'ANÚNCIATE GRATIS',
            icon: '✨',
            title: 'DESTACA AQUÍ',
            desc: 'Contenido exclusivo para anunciantes de Sariel\'s. Anúnciate gratis.',
            cta: 'Destacar gratis'
        }
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

    /**
     * Asigna color de acento (--c) y degradado (--c1, --c2) a cada tarjeta.
     * - Si la tarjeta es un anuncio real (anuncio-card), respeta sus variables.
     * - Si no, aplica la paleta llamativa por índice.
     */
    function asignarColores() {
        cards.forEach(function (card, i) {
            var par = PALETA[i % PALETA.length];
            if (!card.style.getPropertyValue('--c1')) {
                card.style.setProperty('--c1', par[0]);
                card.style.setProperty('--c2', par[1]);
            }
            if (!card.style.getPropertyValue('--c')) {
                card.style.setProperty('--c', par[0]);
            }
        });
    }

    /**
     * Si no hay tarjetas en el DOM, inyecta los placeholders de marketing.
     */
    function inyectarPlaceholders() {
        if (!track) return;
        if (track.querySelectorAll('.carrusel-3d-card').length > 0) return;

        track.innerHTML = PLACEHOLDERS.map(function (p, i) {
            var par = PALETA[i % PALETA.length];
            return '' +
                '<a class="carrusel-3d-card anuncio-placeholder" href="#" ' +
                    'style="--c:' + par[0] + ';--c1:' + par[0] + ';--c2:' + par[1] + ';" ' +
                    'data-indice="' + i + '">' +
                    '<div class="ads-tag"><span class="dot"></span> ÚNETE A SARIEL\'S</div>' +
                    '<div class="ads-counter">' + (i + 1) + '/' + PLACEHOLDERS.length + '</div>' +
                    '<span class="ads-chip">' + p.chip + '</span>' +
                    '<div class="card-icon">' + p.icon + '</div>' +
                    '<div class="card-title">' + p.title + '</div>' +
                    '<div class="card-desc">' + p.desc + '</div>' +
                    '<button class="ads-cta" type="button">' + p.cta + '</button>' +
                '</a>';
        }).join('');

        // Click handler
        track.querySelectorAll('.carrusel-3d-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.ads-cta') || card.classList.contains('anuncio-placeholder')) {
                    e.preventDefault();
                    if (typeof window.abrirModalCrearAnuncio === 'function') {
                        window.abrirModalCrearAnuncio();
                    } else {
                        // Fallback: muestra toast
                        var t = document.getElementById('toast');
                        if (t) {
                            t.textContent = '📣 Muy pronto podrás crear tu anuncio aquí';
                            t.className = 'toast show success';
                            clearTimeout(t._t);
                            t._t = setTimeout(function () { t.className = 'toast'; }, 3000);
                        }
                    }
                }
            });
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
        if (cardRect.width === 0) return;
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
            punto.setAttribute('aria-label', 'Ir al anuncio ' + (i + 1));
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
        if (cards.length === 0) {
            inyectarPlaceholders();
            cards = coleccionar();
            if (cards.length === 0) return;
        }
        asignarColores();
        construirPuntos();
        pedirActualizacion();
        window.dispatchEvent(new Event('carrusel3d:refrescar'));
    }

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
            window.requestAnimationFrame(init);
            return;
        }
        if (inicializado) return;
        inicializado = true;

        // Si el DOM no tiene tarjetas aún, inyectamos los placeholders.
        inyectarPlaceholders();

        cards = coleccionar();
        if (cards.length === 0) {
            window.requestAnimationFrame(init);
            return;
        }

        asignarColores();
        construirPuntos();

        track.addEventListener('scroll', pedirActualizacion, { passive: true });
        window.addEventListener('resize', pedirActualizacion);

        var inicial = 0;
        cards.forEach(function (card, i) {
            if (card.classList.contains('active')) inicial = i;
        });
        activoActual = inicial;

        window.requestAnimationFrame(function () {
            irACardInicial(inicial, 0);
        });

        window.carrusel3D = { refrescar: refrescar };
        window.dispatchEvent(new Event('carrusel3d:listo'));
    }

    window.carrusel3D = window.carrusel3D || { refrescar: function () {} };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();