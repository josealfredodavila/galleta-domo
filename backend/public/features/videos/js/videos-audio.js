// ================================================================
// CSARIEL'S · VIDEOS · AUDIO Y AUTOPLAY (v2)
// ================================================================
// Sonido y reproducción del carrusel.
// - Detecta el primer gesto del usuario (los navegadores bloquean
//   el audio hasta que hay interacción).
// - Reproduce el video activo con sonido; si el navegador lo bloquea,
//   lo reproduce silenciado y muestra el botón "Activar sonido".
// - Pausa los demás videos del feed (solo uno suena a la vez).
// - Carga el video siguiente para que el cambio sea inmediato.
// Expuesto en window.VideosApp.audio y window.activarAudioGlobal.
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

    // Clave de sesión para recordar si el audio fue desbloqueado/activado.
    var CLAVE_SESION_AUDIO = 'cs_audio_desbloqueado';

    /* ---------------- Estado y sesión ---------------- */

    /* ¿El usuario tiene activado el autoplay? (preferencia guardada) */
    function autoplayActivo() {
        try {
            return localStorage.getItem(CONFIG.CLAVE_AUTOPLAY) !== 'false';
        } catch (e) {
            return true;
        }
    }

    /* ¿El audio ya fue desbloqueado/activado en esta sesión? */
    function audioDesbloqueadoEnSesion() {
        try {
            return sessionStorage.getItem(CLAVE_SESION_AUDIO) === '1';
        } catch (e) {
            return false;
        }
    }

    /* Marca el audio como desbloqueado en la sesión (idempotente). */
    function marcarAudioDesbloqueado() {
        if (S.audioGlobalActivado) return;
        S.audioGlobalActivado = true;
        try { sessionStorage.setItem(CLAVE_SESION_AUDIO, '1'); } catch (e) {}
    }

    /* ¿La página está visible? (no forzar reproducción oculta) */
    function paginaVisible() {
        return typeof document === 'undefined' || !document.hidden;
    }

    /* ---------------- Botón "Activar sonido" ---------------- */

    /* Muestra el botón "Activar sonido" solo si hay necesidad real. */
    function mostrarBotonAudioGlobal() {
        if (S.audioGlobalActivado) return;
        var btn = document.getElementById('btnAudioGlobal');
        if (btn) btn.classList.add('visible');
    }

    /* Oculta el botón y lo marca como activo. */
    function ocultarBotonAudioGlobal() {
        var btn = document.getElementById('btnAudioGlobal');
        if (btn) {
            btn.classList.remove('visible');
            btn.classList.add('activo');
        }
    }

    /* ---------------- Activación del audio ---------------- */

    /* Activa el sonido: quita el botón y reanuda el video activo con audio. */
    function activarAudioGlobal() {
        marcarAudioDesbloqueado();
        ocultarBotonAudioGlobal();

        var card = S.cardActiva;
        if (!card) return;
        var v = card.querySelector('video');
        if (!v) return;
        if (!v.isConnected) return;

        // No forzar reproducción si la página está oculta.
        if (!paginaVisible()) return;

        v.muted = false;
        v.volume = 1;
        v.removeAttribute('muted');

        var promesa = v.play();
        if (promesa && typeof promesa.then === 'function') {
            promesa.catch(function (err) {
                // Si aún falla, mostrar botón para reintentar.
                if (err && err.name === 'NotAllowedError') {
                    mostrarBotonAudioGlobal();
                }
            });
        }
    }

    /* ---------------- Reproducción exclusiva ---------------- */

    /* Pausa todos los videos del feed excepto el indicado.
       Evita pause() redundantes sobre videos ya pausados. */
    function pausarOtrosVideos(videoQueSuena) {
        document.querySelectorAll('.video-card video').forEach(function (v) {
            if (v === videoQueSuena) return;
            if (!v.paused) {
                try { v.pause(); } catch (_) {}
            }
            var card = v.closest('.video-card');
            if (card) card.classList.remove('playing');
        });
    }

    /* ---------------- Fuentes ---------------- */

    /* Valida que el <video> sea reproducible y esté en el DOM. */
    function videoValido(video) {
        if (!video) return false;
        if (video.tagName !== 'VIDEO') return false;
        if (video.isConnected === false) return false;
        return true;
    }

    /* Carga el src del video desde data-src, solo cuando hace falta.
       - Solo si el src actual difiere de data-src.
       - Solo llama load() cuando realmente se cambió el src. */
    function asegurarSrc(video) {
        if (!videoValido(video)) return;
        var dataSrc = video.dataset && video.dataset.src;
        if (!dataSrc) return;

        var actual = video.getAttribute('src');
        if (actual === dataSrc) return; // ya cargado con la fuente correcta

        video.preload = 'auto';
        video.src = dataSrc;
        try { video.load(); } catch (_) {}
    }

    /* Precarga el video siguiente del carrusel para que el cambio sea rápido.
       No libera memoria (eso lo gestiona videos-navegacion.js). */
    function precargarSiguiente() {
        var sig = document.querySelector('.video-card[data-indice="' + (S.indiceActivo + 1) + '"]');
        if (!sig) return;
        var v = sig.querySelector('video');
        asegurarSrc(v);
    }

    /* ---------------- Reproducción segura ---------------- */

    /* Intenta reproducir con sonido. Si el navegador bloquea (NotAllowedError),
       cae a silencio y muestra el botón si el autoplay está permitido. */
    function reproducirVideoConSonido(video) {
        if (!videoValido(video)) return;
        if (!paginaVisible()) return;
        if (!autoplayActivo()) return;

        pausarOtrosVideos(video);
        asegurarSrc(video);

        // Si aún no hay fuente válida, no intentar reproducir.
        if (!video.getAttribute('src')) return;

        video.muted = false;
        video.volume = 1;
        video.removeAttribute('muted');

        var promesa;
        try {
            promesa = video.play();
        } catch (err) {
            // Algunos navegadores lanzan síncronamente.
            manejarFalloPlay(video, err);
            return;
        }

        if (promesa && typeof promesa.then === 'function') {
            promesa.catch(function (err) {
                manejarFalloPlay(video, err);
            });
        }
    }

    /* Gestiona el fallo de play() de forma controlada. */
    function manejarFalloPlay(video, err) {
        if (!videoValido(video)) return;
        var nombre = err && err.name ? err.name : '';

        if (nombre === 'NotAllowedError' || nombre === 'AbortError') {
            // Si el autoplay no está permitido, no insistir con silencio.
            if (!autoplayActivo()) {
                mostrarBotonAudioGlobal();
                return;
            }
            // Reintentar silenciado; solo mostrar botón si también falla.
            video.muted = true;
            video.setAttribute('muted', '');
            var p2;
            try {
                p2 = video.play();
            } catch (e2) {
                mostrarBotonAudioGlobal();
                return;
            }
            if (p2 && typeof p2.then === 'function') {
                p2.catch(function () { mostrarBotonAudioGlobal(); });
            }
        } else if (nombre === 'NotSupportedError') {
            // Fuente no soportada: no mostrar botón (no es un problema de audio).
            console.warn('[Videos] Fuente no soportada:', video.currentSrc || video.src);
        } else {
            // Otros errores: silencioso, puede ser un fallo de red que
            // videos-feed.js ya está intentando recuperar.
        }
    }

    /* ---------------- Primer gesto del usuario ---------------- */

    /* Primer gesto del usuario: habilita el audio y oculta el botón.
       Idempotente y detecta el desbloqueo desde la sesión. */
    (function detectarPrimerGesto() {
        // Si ya se desbloqueó antes en esta sesión, marcar y salir.
        if (audioDesbloqueadoEnSesion()) {
            S.audioGlobalActivado = true;
            ocultarBotonAudioGlobal();
            return;
        }

        var eventos = ['click', 'touchstart', 'keydown'];
        var disparado = false;

        function onGesto() {
            if (disparado) return;
            disparado = true;
            marcarAudioDesbloqueado();
            ocultarBotonAudioGlobal();

            eventos.forEach(function (ev) {
                document.removeEventListener(ev, onGesto, true);
            });
        }

        eventos.forEach(function (ev) {
            document.addEventListener(ev, onGesto, { capture: true, passive: true });
        });
    })();

    /* ---------------- Listener global de reproducción exclusiva ---------------- */

    /* Solo un video suena a la vez: cualquier play pausa a los demás del feed.
       Idempotente: solo se registra una vez (el módulo se protege con VA.audio). */
    document.addEventListener('play', function (e) {
        var v = e.target;
        if (!v || v.tagName !== 'VIDEO') return;
        if (!v.closest || !v.closest('.video-card')) return;
        pausarOtrosVideos(v);
    }, true);

    /* ---------------- Contrato público ---------------- */

    VA.audio = {
        autoplayActivo: autoplayActivo,
        audioDesbloqueadoEnSesion: audioDesbloqueadoEnSesion,
        marcarAudioDesbloqueado: marcarAudioDesbloqueado,
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