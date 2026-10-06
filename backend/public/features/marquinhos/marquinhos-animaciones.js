// ================================================================
// MARQUINHOS · ANIMACIONES v1.1 "Disney Mode"
// ================================================================
// ✅ v1.1: Anima el <g id="mq-cuerpo"> en lugar del SVG entero
//          para no pelear con las animaciones CSS del SVG.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosAnim) return;

    var _activo = false;
    var _timers = [];
    var _parpadeando = false;
    var _respirando = false;
    var _estadoActual = 'idle';
    var _cuerpoEl = null;
    var _ojos = null;
    var _pupilas = null;

    function capturarElementos() {
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
    }

    function limpiarTimers() {
        _timers.forEach(function(t) { clearTimeout(t); });
        _timers = [];
    }

    function programar(fn, ms) {
        var t = setTimeout(fn, ms);
        _timers.push(t);
        return t;
    }

    // 1. RESPIRACIÓN
    function respirar() {
        if (!_activo || _respirando) return;
        _respirando = true;
        if (!_cuerpoEl) { _respirando = false; return; }

        _cuerpoEl.style.transition = 'transform 1.8s ease-in-out';
        _cuerpoEl.style.transform = 'scale(1.015)';
        _cuerpoEl.style.transformOrigin = '100px 200px'; // centro del cuerpo

        programar(function() {
            if (!_activo) return;
            _cuerpoEl.style.transform = 'scale(1)';
            programar(function() { _respirando = false; }, 1800);
        }, 1800);
    }

    function loopRespiracion() {
        if (!_activo) return;
        respirar();
        programar(loopRespiracion, 4200);
    }

    // 2. PARPADEO
    function parpadear() {
        if (!_activo || _parpadeando) return;
        _parpadeando = true;

        if (!_ojos.izq || !_ojos.der) {
            _parpadeando = false;
            return;
        }

        _ojos.izq.style.transition = 'ry 0.08s ease-out';
        _ojos.der.style.transition = 'ry 0.08s ease-out';
        _ojos.izq.setAttribute('ry', '1');
        _ojos.der.setAttribute('ry', '1');

        programar(function() {
            if (!_activo) return;
            _ojos.izq.setAttribute('ry', '16');
            _ojos.der.setAttribute('ry', '16');
            programar(function() { _parpadeando = false; }, 200);
        }, 120);
    }

    function loopParpadeo() {
        if (!_activo) return;
        if (_estadoActual === 'idle' || _estadoActual === 'escuchando') {
            parpadear();
        }
        var delay = 3000 + Math.random() * 3000;
        programar(loopParpadeo, delay);
    }

    // 3. MIRADA ERRÁTICA
    function mirarAlrededor() {
        if (!_activo) return;
        if (_estadoActual !== 'idle') {
            programar(mirarAlrededor, 2000);
            return;
        }

        if (!_pupilas.izq || !_pupilas.der) {
            programar(mirarAlrededor, 2000);
            return;
        }

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

    // 4. ANTICIPACIÓN
    function anticiparHabla() {
        if (!_cuerpoEl) return;
        _cuerpoEl.style.transition = 'transform 0.25s ease-out';
        _cuerpoEl.style.transform = 'scale(1.06)';
        _cuerpoEl.style.transformOrigin = '100px 200px';
        programar(function() {
            _cuerpoEl.style.transition = 'transform 0.3s ease-in-out';
            _cuerpoEl.style.transform = 'scale(1.01)';
        }, 300);
    }

    // 5. SQUASH & STRETCH
    function squashHablar() {
        if (!_cuerpoEl) return;
        _cuerpoEl.style.transition = 'transform 0.12s ease-out';
        _cuerpoEl.style.transform = 'scale(1.03, 0.98)';
        _cuerpoEl.style.transformOrigin = '100px 200px';
        programar(function() {
            _cuerpoEl.style.transform = 'scale(0.99, 1.02)';
            programar(function() {
                _cuerpoEl.style.transform = 'scale(1)';
            }, 120);
        }, 100);
    }

    // 6. ESTADOS
    function aplicarEstado(estado) {
        if (!_activo) return;
        _estadoActual = estado;
        if (!_cuerpoEl) return;

        _cuerpoEl.style.transition = 'transform 0.4s ease-in-out';
        _cuerpoEl.style.transformOrigin = '100px 200px';

        switch (estado) {
            case 'idle':
                _cuerpoEl.style.transform = 'scale(1) rotate(0deg)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 0)';
                    _pupilas.der.style.transform = 'translate(0, 0)';
                }
                break;

            case 'escuchando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'rotate(-5deg)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -1px)';
                    _pupilas.der.style.transform = 'translate(0, -1px)';
                }
                break;

            case 'pensando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'translateY(-3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -3px)';
                    _pupilas.der.style.transform = 'translate(0, -3px)';
                }
                break;

            case 'feliz':
                _cuerpoEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
                _cuerpoEl.style.transform = 'scale(1.08) translateY(-6px)';
                programar(function() {
                    _cuerpoEl.style.transform = 'scale(1) translateY(0)';
                }, 350);
                break;

            case 'triste':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'translateY(3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 2px)';
                    _pupilas.der.style.transform = 'translate(0, 2px)';
                }
                break;

            case 'hablando':
                // squashHablar se llama desde pet.js en cada visema
                break;
        }
    }

    // API
    function iniciar() {
        if (_activo) return;
        _activo = true;
        capturarElementos();
        loopRespiracion();
        loopParpadeo();
        mirarAlrededor();
        console.log('[Marquinhos/Anim] ✅ Sistema Disney v1.1 activo');
    }

    function detener() {
        _activo = false;
        limpiarTimers();
        _parpadeando = false;
        _respirando = false;
        if (_ojos.izq && _ojos.der) {
            _ojos.izq.setAttribute('ry', '16');
            _ojos.der.setAttribute('ry', '16');
        }
        if (_cuerpoEl) {
            _cuerpoEl.style.transition = 'none';
            _cuerpoEl.style.transform = 'scale(1) rotate(0deg) translateY(0)';
        }
    }

    function setEstado(estado) { aplicarEstado(estado); }
    function anticipar() { anticiparHabla(); }
    function squash() { squashHablar(); }

    window.MarquinhosAnim = {
        iniciar: iniciar,
        detener: detener,
        reiniciar: function() { detener(); setTimeout(iniciar, 100); },
        setEstado: setEstado,
        anticipar: anticipar,
        squash: squash
    };

    console.log('[Marquinhos/Anim] Módulo v1.1 cargado');
})();