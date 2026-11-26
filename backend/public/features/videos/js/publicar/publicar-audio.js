/* ================================================================
   CSARIEL'S · VIDEOS · PUBLICAR · AUDIO (v1)
   ================================================================
   Tercer módulo de la división de videos-publicar.js.
   - Visualizador: analizador de Web Audio que mueve las barras del
     ecualizador. Pausar y reanudar no destruye el contexto de audio.
   - AudioPreview: reproduce 5 segundos de una pista, controla el estado
     (loading, playing, paused, error) y el tiempo para la barra inferior.
   No modifica el DOM de las hojas. Avisa mediante listeners que
   publicar-sheets.js registra con NS.audio.setListeners().
   Expuesto en NS.audio.
   Requiere: publicar-base.js.
   ================================================================ */

(function () {
    'use strict';

    var NS = window.VideosPublicarNS;
    if (!NS || !NS.C || !NS.u) {
        console.error('[VideosPublicar] publicar-audio.js requiere publicar-base.js.');
        return;
    }
    if (NS.audio) return;

    var C = NS.C;
    var U = NS.u;
    var S = NS.state;

    /* Listeners registrados por el módulo de hojas.
       estado: (estado, pista, error) — cambios de reproducción.
       tick:   () — se llama cada 250 ms mientras suena (para la barra de tiempo). */
    var listeners = { estado: null, tick: null };

    function setListeners(opts) {
        opts = opts || {};
        if (typeof opts.estado === 'function') listeners.estado = opts.estado;
        if (typeof opts.tick === 'function') listeners.tick = opts.tick;
    }

    function emitirEstado(estado, pista, error) {
        if (listeners.estado) listeners.estado(estado, pista, error);
    }

    function emitirTick() {
        if (listeners.tick) listeners.tick();
    }

    /* Contenedor del ecualizador de una fila de la lista de sonidos. */
    function eqDe(id) {
        return document.querySelector('[data-art-id="' + id + '"] .cs-eq');
    }

    /* ----------------------------------------------------------------
       VISUALIZADOR: el analizador controla las barras del ecualizador.
       Pausar y reanudar no destruye el contexto de audio.
       ---------------------------------------------------------------- */

    var Visualizador = (function () {
        var ctx = null;
        var analyser = null;
        var fuente = null;
        var datos = null;
        var rafId = null;
        var activo = false;
        var eqActual = null;
        var barrasActual = [];
        var audioActual = null;

        /* Conecta el elemento de audio al analizador. Devuelve false si el navegador no lo permite. */
        function asegurarContexto(elemento) {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;
            try {
                if (!ctx) ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume().catch(function () {});
                if (!analyser) {
                    analyser = ctx.createAnalyser();
                    analyser.fftSize = 64;
                    analyser.smoothingTimeConstant = 0.72;
                    analyser.connect(ctx.destination);
                    datos = new Uint8Array(analyser.frequencyBinCount);
                }
                if (fuente) {
                    try { fuente.disconnect(); } catch (e) {}
                    fuente = null;
                }
                fuente = ctx.createMediaElementSource(elemento);
                fuente.connect(analyser);
                return true;
            } catch (e) {
                return false;
            }
        }

        /* Mueve cada barra según la energía de su rango de frecuencias. */
        function pintarBarras() {
            if (!analyser || !datos || !barrasActual.length) return;
            analyser.getByteFrequencyData(datos);
            var paso = Math.floor(datos.length / barrasActual.length) || 1;
            barrasActual.forEach(function (barra, i) {
                var valor = datos[i * paso] || 0;
                var energia = valor / 255;
                barra.style.height = (4 + energia * 22) + 'px';
                barra.style.opacity = String(0.55 + energia * 0.45);
            });
        }

        function bucle() {
            if (!activo) return;
            pintarBarras();
            rafId = requestAnimationFrame(bucle);
        }

        /* Asocia el ecualizador de una fila. conAnalizador: si el audio se está analizando. */
        function marcarEq(elementoEq, conAnalizador) {
            eqActual = elementoEq || null;
            barrasActual = eqActual ? Array.prototype.slice.call(eqActual.querySelectorAll('.cs-eq-bar')) : [];
            if (eqActual) eqActual.classList.toggle('cs-eq-live', !!conAnalizador);
        }

        /* Devuelve las barras a su estado CSS (animación de respaldo). */
        function resetearBarras() {
            if (eqActual) eqActual.classList.remove('cs-eq-live');
            barrasActual.forEach(function (b) {
                b.style.height = '';
                b.style.opacity = '';
            });
        }

        function pausar() {
            activo = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            resetearBarras();
        }

        function reanudar(elementoEq, elementoAudio) {
            if (elementoAudio && audioActual === elementoAudio && fuente && analyser) {
                marcarEq(elementoEq, true);
                activo = true;
                bucle();
                return;
            }
            iniciar(elementoEq, elementoAudio);
        }

        function iniciar(elementoEq, elementoAudio) {
            pausar();
            if (fuente) {
                try { fuente.disconnect(); } catch (e) {}
                fuente = null;
            }
            var conAnalizador = elementoAudio ? asegurarContexto(elementoAudio) : false;
            audioActual = elementoAudio || null;
            marcarEq(elementoEq, conAnalizador);
            if (conAnalizador) {
                activo = true;
                bucle();
            }
        }

        /* Libera el analizador y el contexto de audio. */
        function detener() {
            pausar();
            if (fuente) {
                try { fuente.disconnect(); } catch (e) {}
                fuente = null;
            }
            if (ctx) {
                try { ctx.close(); } catch (e) {}
                ctx = null;
            }
            analyser = null;
            datos = null;
            audioActual = null;
            eqActual = null;
            barrasActual = [];
        }

        return { iniciar: iniciar, pausar: pausar, reanudar: reanudar, detener: detener };
    })();

    /* ----------------------------------------------------------------
       VISTA PREVIA DE AUDIO: 5 segundos, estado y tiempo.
       ---------------------------------------------------------------- */

    var AudioPreview = (function () {
        var audio = null;
        var timerId = null;
        var tickId = null;
        var generation = 0;
        var pistaActual = null;
        var estado = 'idle';

        function iniciarTicker() {
            detenerTicker();
            tickId = setInterval(emitirTick, 250);
        }

        function detenerTicker() {
            if (tickId !== null) {
                clearInterval(tickId);
                tickId = null;
            }
        }

        /* Corta el audio actual y libera el analizador. No cambia la pista. */
        function limpiar() {
            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null;
            }
            detenerTicker();
            Visualizador.detener();
            if (audio) {
                try {
                    audio.pause();
                    audio.removeAttribute('src');
                    audio.load();
                } catch (e) {}
                audio.onerror = null;
                audio.oncanplay = null;
                audio = null;
            }
            estado = 'idle';
        }

        /* Detiene todo y olvida la pista. */
        function detener() {
            generation++;
            limpiar();
            pistaActual = null;
        }

        /* Reproduce 5 segundos de la pista. onEstado es opcional; si no llega, se usa el listener registrado. */
        async function reproducir(pista, onEstado) {
            var notificar = typeof onEstado === 'function' ? onEstado : emitirEstado;

            generation++;
            var miGeneracion = generation;
            limpiar();
            pistaActual = pista;
            estado = 'loading';
            notificar('loading', pista);

            if (!pista || !pista.url) {
                estado = 'error';
                notificar('error', pista, 'URL vacía');
                return { ok: false, error: 'URL vacía' };
            }

            var nuevoAudio = new Audio();
            nuevoAudio.preload = 'auto';
            nuevoAudio.volume = 0.8;
            nuevoAudio.crossOrigin = 'anonymous';
            audio = nuevoAudio;

            var esperaDatos = new Promise(function (resolve, reject) {
                var resuelto = false;
                var timeout = setTimeout(function () {
                    if (!resuelto) {
                        resuelto = true;
                        reject(new Error('timeout'));
                    }
                }, 10000);

                nuevoAudio.oncanplay = function () {
                    if (!resuelto) {
                        resuelto = true;
                        clearTimeout(timeout);
                        resolve();
                    }
                };

                nuevoAudio.onerror = function () {
                    if (!resuelto) {
                        resuelto = true;
                        clearTimeout(timeout);
                        var code = nuevoAudio.error ? nuevoAudio.error.code : 0;
                        reject(new Error('media_error_' + code));
                    }
                };

                nuevoAudio.src = pista.url;
                nuevoAudio.load();
            });

            try {
                await esperaDatos;
            } catch (e) {
                if (miGeneracion !== generation) return { ok: false, cancelado: true };
                limpiar();
                estado = 'error';
                notificar('error', pista, e.message);
                return { ok: false, error: e.message };
            }

            if (miGeneracion !== generation) {
                try { nuevoAudio.pause(); } catch (e) {}
                return { ok: false, cancelado: true };
            }

            try {
                await nuevoAudio.play();
            } catch (e) {
                if (miGeneracion !== generation) return { ok: false, cancelado: true };
                if (e.name === 'AbortError') return { ok: false, cancelado: true };
                limpiar();
                estado = 'error';
                notificar('error', pista, e.name || 'play_error');
                return { ok: false, error: e.name };
            }

            if (miGeneracion !== generation) {
                try { nuevoAudio.pause(); } catch (e) {}
                return { ok: false, cancelado: true };
            }

            estado = 'playing';
            notificar('playing', pista);

            Visualizador.iniciar(eqDe(pista.id), nuevoAudio);
            iniciarTicker();

            timerId = setTimeout(function () {
                if (miGeneracion !== generation) return;
                if (audio === nuevoAudio) {
                    try { nuevoAudio.pause(); } catch (e) {}
                    estado = 'paused';
                    Visualizador.pausar();
                    detenerTicker();
                    emitirTick();
                    notificar('paused', pista);
                }
                timerId = null;
            }, C.DURACION_PREVIEW_MS);

            return { ok: true, generacion: miGeneracion };
        }

        function pausar() {
            if (audio && estado === 'playing') {
                try { audio.pause(); } catch (e) {}
                estado = 'paused';
                Visualizador.pausar();
                detenerTicker();
                emitirTick();
                emitirEstado('paused', pistaActual);
            }
        }

        function reanudar() {
            if (audio && estado === 'paused' && pistaActual) {
                audio.play().then(function () {
                    estado = 'playing';
                    Visualizador.reanudar(eqDe(pistaActual.id), audio);
                    iniciarTicker();
                    emitirEstado('playing', pistaActual);
                }).catch(function () {});
            }
        }

        function getEstado() {
            return { estado: estado, pista: pistaActual };
        }

        /* Tiempo para la barra inferior: usa la duración real si ya cargó. */
        function getTiempo() {
            if (!pistaActual) return null;
            var total = (audio && isFinite(audio.duration) && audio.duration > 0)
                ? audio.duration
                : (pistaActual.duracion || 0);
            var actual = audio ? (audio.currentTime || 0) : 0;
            return { actual: actual, total: total, pista: pistaActual };
        }

        return {
            reproducir: reproducir,
            detener: detener,
            pausar: pausar,
            reanudar: reanudar,
            getEstado: getEstado,
            getTiempo: getTiempo
        };
    })();

    /* ----------------------------------------------------------------
       EXPOSICIÓN
       ---------------------------------------------------------------- */

    NS.audio = {
        reproducir: AudioPreview.reproducir,
        detener: AudioPreview.detener,
        pausar: AudioPreview.pausar,
        reanudar: AudioPreview.reanudar,
        getEstado: AudioPreview.getEstado,
        getTiempo: AudioPreview.getTiempo,
        setListeners: setListeners
    };
})();