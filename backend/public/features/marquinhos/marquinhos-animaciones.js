// ================================================================
// MARQUINHOS · ANIMACIONES v1.0 "Disney Mode"
// ================================================================
// Sistema de vida para el personaje:
//   - Respiración (idle breathing)
//   - Parpadeo aleatorio (eye blink)
//   - Mirada errática (eye tracking)
//   - Anticipación al hablar (inhale antes de hablar)
//   - Squash & Stretch (rebote al hablar)
//   - Estados expresivos (pensando, escuchando, feliz, triste)
//   - Capas de accesorios (profundidad correcta)
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosAnim) return;

    // ============================================================
    // ESTADO INTERNO
    // ============================================================
    var _activo = false;
    var _timers = [];
    var _parpadeando = false;
    var _respirando = false;
    var _estadoActual = 'idle';
    var _svgEl = null;
    var _cabezaEl = null;
    var _cuerpoEl = null;
    var _ojos = null;
    var _pupilas = null;
    var _boca = null;

    // Referencias a elementos SVG (se configuran al montar)
    function capturarElementos() {
        _svgEl = document.querySelector('.mq-pet-svg');
        _cabezaEl = document.getElementById('mq-cabeza');
        _cuerpoEl = document.getElementById('mq-cuerpo');
        _ojos = {
            izq: document.getElementById('mq-ojo-izq'),
            der: document.getElementById('mq-ojo-der')
        };
        _pupilas = {
            izq: document.getElementById('mq-pupila-izq'),
            der: document.getElementById('mq-pupila-der'),
            brilloIzq: document.getElementById('mq-brillo-izq'),
            brilloDer: document.getElementById('mq-brillo-der')
        };
        _boca = document.getElementById('mq-boca');
    }

    function limpiarTimers() {
        _timers.forEach(function(t) { clearTimeout(t); clearInterval(t); });
        _timers = [];
    }

    function programar(fn, ms) {
        var t = setTimeout(fn, ms);
        _timers.push(t);
        return t;
    }

    // ============================================================
    // 1. RESPIRACIÓN
    // ============================================================
    function respirar() {
        if (!_activo || _respirando) return;
        _respirando = true;
        if (!_svgEl) { _respirando = false; return; }

        // Inflar
        _svgEl.style.transition = 'transform 1.8s ease-in-out';
        _svgEl.style.transform = 'scale(1.02)';

        // Desinflar después de 1.8s
        programar(function() {
            if (!_activo) return;
            _svgEl.style.transform = 'scale(1)';
            programar(function() { _respirando = false; }, 1800);
        }, 1800);
    }

    function loopRespiracion() {
        if (!_activo) return;
        respirar();
        programar(loopRespiracion, 4200); // Ciclo completo cada 4.2s
    }

    // ============================================================
    // 2. PARPADEO
    // ============================================================
    function parpadear() {
        if (!_activo || _parpadeando) return;
        _parpadeando = true;

        if (!_ojos.izq || !_ojos.der) {
            _parpadeando = false;
            return;
        }

        // Cerrar ojos (ry a 1)
        _ojos.izq.style.transition = 'ry 0.08s ease-out';
        _ojos.der.style.transition = 'ry 0.08s ease-out';
        _ojos.izq.setAttribute('ry', '1');
        _ojos.der.setAttribute('ry', '1');

        // Abrir después de 120ms
        programar(function() {
            if (!_activo) return;
            _ojos.izq.setAttribute('ry', '16');
            _ojos.der.setAttribute('ry', '16');
            programar(function() { _parpadeando = false; }, 200);
        }, 120);
    }

    function loopParpadeo() {
        if (!_activo) return;
        // Solo parpadear si estamos en idle o escuchando
        if (_estadoActual === 'idle' || _estadoActual === 'escuchando') {
            parpadear();
        }
        var delay = 3000 + Math.random() * 3000; // 3-6s
        programar(loopParpadeo, delay);
    }

    // ============================================================
    // 3. MIRADA ERRÁTICA
    // ============================================================
    function mirarAlrededor() {
        if (!_activo) return;
        // Solo mirar si estamos en idle
        if (_estadoActual !== 'idle') {
            programar(mirarAlrededor, 2000);
            return;
        }

        if (!_pupilas.izq || !_pupilas.der) {
            programar(mirarAlrededor, 2000);
            return;
        }

        // Movimiento aleatorio suave
        var dx = (Math.random() - 0.5) * 8;
        var dy = (Math.random() - 0.5) * 5;

        var transition = 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _pupilas.izq.style.transition = transition;
        _pupilas.der.style.transition = transition;

        var transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        _pupilas.izq.style.transform = transform;
        _pupilas.der.style.transform = transform;

        if (_pupilas.brilloIzq && _pupilas.brilloDer) {
            _pupilas.brilloIzq.style.transition = transition;
            _pupilas.brilloDer.style.transition = transition;
            _pupilas.brilloIzq.style.transform = transform;
            _pupilas.brilloDer.style.transform = transform;
        }

        var delay = 2000 + Math.random() * 2500;
        programar(mirarAlrededor, delay);
    }

    // ============================================================
    // 4. ANTICIPACIÓN AL HABLAR (inhale)
    // ============================================================
    function anticiparHabla() {
        if (!_svgEl) return;
        _svgEl.style.transition = 'transform 0.25s ease-out';
        _svgEl.style.transform = 'scale(1.06)';
        // Volver al hablar
        programar(function() {
            _svgEl.style.transition = 'transform 0.3s ease-in-out';
            _svgEl.style.transform = 'scale(1.01)';
        }, 300);
    }

    // ============================================================
    // 5. SQUASH & STRETCH al hablar
    // ============================================================
    function squashHablar() {
        if (!_svgEl) return;
        // Estirar ligeramente durante la sílaba
        _svgEl.style.transition = 'transform 0.12s ease-out';
        _svgEl.style.transform = 'scale(1.03, 0.98)';
        programar(function() {
            _svgEl.style.transform = 'scale(0.99, 1.02)';
            programar(function() {
                _svgEl.style.transform = 'scale(1)';
            }, 120);
        }, 100);
    }

    // ============================================================
    // 6. ESTADOS EXPRESIVOS
    // ============================================================
    function aplicarEstado(estado) {
        if (!_activo) return;
        _estadoActual = estado;

        if (!_svgEl) return;

        // Resetear transformaciones base
        _svgEl.style.transition = 'transform 0.4s ease-in-out';

        switch (estado) {
            case 'idle':
                _svgEl.style.transform = 'scale(1) rotate(0deg)';
                // Resetear pupilas
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 0)';
                    _pupilas.der.style.transform = 'translate(0, 0)';
                }
                break;

            case 'hablando':
                // Ligero movimiento en cada sílaba (squashHablar se llama desde pet.js)
                break;

            case 'escuchando':
                // Inclinar cabeza hacia un lado
                _svgEl.style.transition = 'transform 0.6s ease-in-out';
                _svgEl.style.transform = 'scale(1) rotate(-5deg)';
                // Pupilas más centradas
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -1px)';
                    _pupilas.der.style.transform = 'translate(0, -1px)';
                }
                break;

            case 'pensando':
                // Inclinar cabeza arriba + mirar arriba
                _svgEl.style.transition = 'transform 0.6s ease-in-out';
                _svgEl.style.transform = 'scale(1) rotate(0deg) translateY(-3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -3px)';
                    _pupilas.der.style.transform = 'translate(0, -3px)';
                }
                break;

            case 'feliz':
                // Saltito
                _svgEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
                _svgEl.style.transform = 'scale(1.08) translateY(-6px)';
                programar(function() {
                    _svgEl.style.transform = 'scale(1) translateY(0)';
                }, 350);
                break;

            case 'triste':
                // Cabeza abajo
                _svgEl.style.transition = 'transform 0.6s ease-in-out';
                _svgEl.style.transform = 'rotate(0deg) translateY(3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 2px)';
                    _pupilas.der.style.transform = 'translate(0, 2px)';
                }
                break;
        }
    }

    // ============================================================
    // API PÚBLICA
    // ============================================================
    function iniciar() {
        if (_activo) return;
        _activo = true;
        capturarElementos();
        loopRespiracion();
        loopParpadeo();
        mirarAlrededor();
        console.log('[Marquinhos/Anim] ✅ Sistema Disney activo');
    }

    function detener() {
        _activo = false;
        limpiarTimers();
        _parpadeando = false;
        _respirando = false;
        // Restaurar ojos
        if (_ojos.izq && _ojos.der) {
            _ojos.izq.setAttribute('ry', '16');
            _ojos.der.setAttribute('ry', '16');
        }
        if (_svgEl) {
            _svgEl.style.transition = 'none';
            _svgEl.style.transform = 'scale(1) rotate(0deg) translateY(0)';
        }
    }

    function reiniciar() {
        detener();
        setTimeout(iniciar, 100);
    }

    function setEstado(estado) {
        aplicarEstado(estado);
    }

    function anticipar() { anticiparHabla(); }
    function squash() { squashHablar(); }

    window.MarquinhosAnim = {
        iniciar: iniciar,
        detener: detener,
        reiniciar: reiniciar,
        setEstado: setEstado,
        anticipar: anticipar,
        squash: squash
    };

    console.log('[Marquinhos/Anim] Módulo cargado');
})();