// ================================================================
// CSARIEL'S · VIDEOS · AUDIO Y AUTOPLAY (v1)
// ================================================================
// Sonido y reproducción del carrusel.
// - Detecta el primer gesto del usuario (los navegadores bloquean
//   el audio hasta que hay interacción).
// - Reproduce el video activo con sonido; si el navegador lo bloquea,
//   lo reproduce silenciado y muestra el botón "Activar sonido".
// - Pausa los demás videos del feed (solo uno suena a la vez).
// - Carga el video siguiente para que el cambio sea inmediato.
// Expuesto en window.VideosApp.audio.
// Requiere: config, utils.
// ================================================================

(function () {
    'use strict';

    var VA = window.VideosApp;
    if (!VA || !VA.__config || !VA.utils) {
        console.error('[Videos] videos-audio.js requiere videos-config.js y videos-utils.js.');
        return;
    }
    if (VA.audio) return;

    var CONFIG = VA.CONFIG;
    var S = VA.state;

    /* ¿El usuario tiene activado el autoplay? (preferencia guardada) */
    function autoplayActivo() {
        try {
            return localStorage.getItem(CONFIG.CLAVE_AUTOPLAY) !== 'false';
        } catch (e) {
            return true;
        }
    }

    /* Muestra el botón "Activar sonido" si aún no hubo gesto. */
    function mostrarBotonAudioGlobal() {
        if (S.audioGlobalActivado) return;
        var btn = document.getElementById('btnAudioGlobal');
        if (btn) btn.classList.add('visible');
    }

    /* Activa el sonido: quita el botón y reanuda el video activo con audio. */
    function activarAudioGlobal() {
        S.audioGlobalActivado = true;

        var card = S.cardActiva;
        if (card) {
            var v = card.querySelector('video');
            if (v) {
                v.muted = false;
                v.volume = 1;
                v.removeAttribute('muted');
                v.play().catch(function () {});
            }
        }

        var btn = document.getElementById('btnAudioGlobal');
        if (btn) {
            btn.classList.remove('visible');
            btn.classList.add('activo');
        }
    }

    /* Pausa todos los videos del feed excepto el indicado. */
    function pausarOtrosVideos(videoQueSuena) {
        document.querySelectorAll('.video-card video').forEach(function (v) {
            if (v === videoQueSuena) return;
            if (!v.paused) v.pause();
            var card = v.closest('.video-card');
            if (card) card.classList.remove('playing');
        });
    }

    /* Carga el src del video desde data-src, solo cuando hace falta. */
    function asegurarSrc(video) {
        if (video && !video.getAttribute('src') && video.dataset.src) {
            video.preload = 'auto';
            video.src = video.dataset.src;
            video.load();
        }
    }

    /* Reproduce con sonido. Si el navegador lo bloquea, reintenta
       silenciado y muestra el botón para activar el audio. */
    function reproducirVideoConSonido(video) {
        if (!video) return;
        pausarOtrosVideos(video);
        asegurarSrc(video);

        video.muted = false;
        video.volume = 1;
        video.removeAttribute('muted');

        var promesa = video.play();
        if (promesa && typeof promesa.then === 'function') {
            promesa.catch(function (err) {
                if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
                    video.muted = true;
                    video.setAttribute('muted', '');
                    video.play().catch(function () { mostrarBotonAudioGlobal(); });
                }
            });
        }
    }

    /* Precarga el video siguiente del carrusel para que el cambio sea rápido. */
    function precargarSiguiente() {
        var sig = document.querySelector('.video-card[data-indice="' + (S.indiceActivo + 1) + '"]');
        if (sig) asegurarSrc(sig.querySelector('video'));
    }

    /* Primer gesto del usuario: habilita el audio y oculta el botón. */
    (function detectarPrimerGesto() {
        var eventos = ['click', 'touchstart', 'keydown'];
        var disparado = false;

        function onGesto() {
            if (disparado) return;
            disparado = true;
            S.audioGlobalActivado = true;

            var btn = document.getElementById('btnAudioGlobal');
            if (btn) btn.classList.remove('visible');

            eventos.forEach(function (ev) {
                document.removeEventListener(ev, onGesto, true);
            });
        }

        eventos.forEach(function (ev) {
            document.addEventListener(ev, onGesto, { capture: true, passive: true });
        });
    })();

    /* Solo un video suena a la vez: cualquier play pausa a los demás del feed. */
    document.addEventListener('play', function (e) {
        var v = e.target;
        if (v && v.tagName === 'VIDEO' && v.closest && v.closest('.video-card')) {
            pausarOtrosVideos(v);
        }
    }, true);

    VA.audio = {
        autoplayActivo: autoplayActivo,
        mostrarBotonAudioGlobal: mostrarBotonAudioGlobal,
        activarAudioGlobal: activarAudioGlobal,
        pausarOtrosVideos: pausarOtrosVideos,
        asegurarSrc: asegurarSrc,
        reproducirVideoConSonido: reproducirVideoConSonido,
        precargarSiguiente: precargarSiguiente
    };

    /* Contrato global: videos-init.js conecta el botón y lo expone. */
    window.activarAudioGlobal = activarAudioGlobal;
})();