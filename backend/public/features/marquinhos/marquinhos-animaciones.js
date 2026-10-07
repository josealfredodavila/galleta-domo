// ================================================================
// MARQUINHOS · ANIMACIONES v2.0 "Galactic Mode"
// ================================================================
// Sistema completo de animaciones:
//   - Respiración + parpadeo + mirada
//   - Cejas expresivas
//   - Manos que gesticulan al hablar
//   - Saludo con la mano
//   - Festejo (brazos arriba)
//   - Pensar (mano en la barbilla)
//   - Antenas que pulsan (CSS anim)
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
    var _cejas = null;
    var _brazos = null;
    var _manos = null;
    var _piernas = null;

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
        _cejas = {
            izq: document.getElementById('mq-ceja-izq'),
            der: document.getElementById('mq-ceja-der')
        };
        _brazos = {
            izq: document.getElementById('mq-brazo-izq'),
            der: document.getElementById('mq-brazo-der')
        };
        _manos = {
            izq: document.getElementById('mq-mano-izq'),
            der: document.getElementById('mq-mano-der')
        };
        _piernas = {
            izq: document.getElementById('mq-pierna-izq'),
            der: document.getElementById('mq-pierna-der')
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

    // ============================================================
    // 1. RESPIRACIÓN
    // ============================================================
    function respirar() {
        if (!_activo || _respirando) return;
        _respirando = true;
        if (!_cuerpoEl) { _respirando = false; return; }

        _cuerpoEl.style.transition = 'transform 1.8s ease-in-out';
        _cuerpoEl.style.transform = 'scale(1.015)';
        _cuerpoEl.style.transformOrigin = '100px 190px';

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

    // ============================================================
    // 2. PARPADEO (más frecuente ahora)
    // ============================================================
    function parpadear() {
        if (!_activo || _parpadeando) return;
        _parpadeando = true;

        if (!_ojos.izq || !_ojos.der) { _parpadeando = false; return; }

        _ojos.izq.style.transition = 'ry 0.08s ease-out';
        _ojos.der.style.transition = 'ry 0.08s ease-out';
        _ojos.izq.setAttribute('ry', '1');
        _ojos.der.setAttribute('ry', '1');

        programar(function() {
            if (!_activo) return;
            _ojos.izq.setAttribute('ry', '17');
            _ojos.der.setAttribute('ry', '17');
            programar(function() { _parpadeando = false; }, 200);
        }, 120);
    }

    function loopParpadeo() {
        if (!_activo) return;
        if (_estadoActual === 'idle' || _estadoActual === 'escuchando') {
            parpadear();
        }
        // ✅ v2.0: parpadeo más frecuente (2-4s)
        var delay = 2000 + Math.random() * 2000;
        programar(loopParpadeo, delay);
    }

    // ============================================================
    // 3. MIRADA ERRÁTICA
    // ============================================================
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

    // ============================================================
    // 4. ANTICIPACIÓN AL HABLAR
    // ============================================================
    function anticiparHabla() {
        if (!_cuerpoEl) return;
        _cuerpoEl.style.transition = 'transform 0.25s ease-out';
        _cuerpoEl.style.transform = 'scale(1.06)';
        _cuerpoEl.style.transformOrigin = '100px 190px';
        programar(function() {
            _cuerpoEl.style.transition = 'transform 0.3s ease-in-out';
            _cuerpoEl.style.transform = 'scale(1.01)';
        }, 300);
    }

    // ============================================================
    // 5. SQUASH & STRETCH (al hablar)
    // ============================================================
    function squashHablar() {
        if (!_cuerpoEl) return;
        _cuerpoEl.style.transition = 'transform 0.12s ease-out';
        _cuerpoEl.style.transform = 'scale(1.03, 0.98)';
        _cuerpoEl.style.transformOrigin = '100px 190px';
        programar(function() {
            _cuerpoEl.style.transform = 'scale(0.99, 1.02)';
            programar(function() {
                _cuerpoEl.style.transform = 'scale(1)';
            }, 120);
        }, 100);
    }

    // ============================================================
    // ✅ v2.0: 6. GESTICULAR CON LAS MANOS (al hablar)
    // ============================================================
    var _gestoActual = 0;
    function gesticular() {
        if (!_activo) return;
        if (_estadoActual !== 'hablando' && _estadoActual !== 'escuchando') {
            // Solo gesticular al hablar
            return;
        }
        if (!_brazos.izq || !_brazos.der) return;

        _gestoActual++;
        var trans = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.izq.style.transition = trans;
        _brazos.der.style.transition = trans;

        // Alternar gestos para que no sea monótono
        var g = _gestoActual % 4;
        var anguloIzq = 0, anguloDer = 0;

        if (g === 0) { anguloIzq = 15; anguloDer = -15; }
        else if (g === 1) { anguloIzq = -10; anguloDer = 10; }
        else if (g === 2) { anguloIzq = 20; anguloDer = -20; }
        else { anguloIzq = -8; anguloDer = 8; }

        _brazos.izq.style.transform = 'rotate(' + anguloIzq + 'deg)';
        _brazos.der.style.transform = 'rotate(' + anguloDer + 'deg)';
        _brazos.izq.style.transformOrigin = '35px 165px';
        _brazos.der.style.transformOrigin = '165px 165px';

        // Volver a posición neutra después de 400ms
        programar(function() {
            if (!_brazos.izq) return;
            _brazos.izq.style.transition = 'transform 0.4s ease-out';
            _brazos.der.style.transition = 'transform 0.4s ease-out';
            _brazos.izq.style.transform = 'rotate(0deg)';
            _brazos.der.style.transform = 'rotate(0deg)';
        }, 400);
    }

    // ============================================================
    // ✅ v2.0: 7. SALUDAR CON LA MANO
    // ============================================================
    function saludar() {
        if (!_activo) return;
        if (!_brazos.der || !_manos.der) return;

        // Levantar el brazo derecho
        _brazos.der.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.der.style.transformOrigin = '165px 165px';
        _brazos.der.style.transform = 'rotate(-50deg) translateY(-15px)';

        // Mover la mano varias veces (wave)
        var movimientos = 0;
        function ondear() {
            if (movimientos >= 4) {
                // Bajar el brazo
                _brazos.der.style.transition = 'transform 0.5s ease-in-out';
                _brazos.der.style.transform = 'rotate(0deg)';
                return;
            }
            _manos.der.style.transition = 'transform 0.2s ease-in-out';
            _manos.der.style.transform = movimientos % 2 === 0 ? 'rotate(15deg)' : 'rotate(-15deg)';
            _manos.der.style.transformOrigin = '170px 235px';
            movimientos++;
            programar(ondear, 200);
        }
        ondear();

        // Reset
        programar(function() {
            if (_manos.der) {
                _manos.der.style.transform = 'rotate(0deg)';
            }
        }, 1000);
    }

    // ============================================================
    // ✅ v2.0: 8. FESTEJAR (brazos arriba + saltito)
    // ============================================================
    function festejar() {
        if (!_activo) return;
        if (!_cuerpoEl || !_brazos.izq || !_brazos.der) return;

        // Saltar
        _cuerpoEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _cuerpoEl.style.transform = 'scale(1.08) translateY(-15px)';
        _cuerpoEl.style.transformOrigin = '100px 190px';

        // Brazos arriba
        _brazos.izq.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.der.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.izq.style.transformOrigin = '35px 165px';
        _brazos.der.style.transformOrigin = '165px 165px';
        _brazos.izq.style.transform = 'rotate(60deg) translateY(-15px)';
        _brazos.der.style.transform = 'rotate(-60deg) translateY(-15px)';

        programar(function() {
            _cuerpoEl.style.transform = 'scale(1) translateY(0)';
        }, 500);

        programar(function() {
            _brazos.izq.style.transform = 'rotate(0deg)';
            _brazos.der.style.transform = 'rotate(0deg)';
        }, 800);
    }

    // ============================================================
    // ✅ v2.0: 9. PENSAR (mano en la barbilla)
    // ============================================================
    function pensarConMano() {
        if (!_activo) return;
        if (!_brazos.der) return;

        _brazos.der.style.transition = 'transform 0.5s ease-in-out';
        _brazos.der.style.transformOrigin = '165px 165px';
        _brazos.der.style.transform = 'rotate(-120deg) translateY(-45px)';
    }

    function dejarDePensar() {
        if (!_brazos.der) return;
        _brazos.der.style.transition = 'transform 0.4s ease-in-out';
        _brazos.der.style.transform = 'rotate(0deg)';
    }

    // ============================================================
    // ✅ v2.0: 10. CEJAS EXPRESIVAS
    // ============================================================
    function cejasNormales() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 62 62 Q 74 55 86 62');
        _cejas.der.setAttribute('d', 'M 114 62 Q 126 55 138 62');
    }

    function cejasSorprendidas() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 62 58 Q 74 48 86 58');
        _cejas.der.setAttribute('d', 'M 114 58 Q 126 48 138 58');
    }

    function cejasPensativas() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 62 60 Q 74 52 86 58');
        _cejas.der.setAttribute('d', 'M 114 58 Q 126 52 138 60');
    }

    function cejasFelices() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 62 60 Q 74 52 86 58');
        _cejas.der.setAttribute('d', 'M 114 58 Q 126 52 138 60');
    }

    function cejasTristes() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 62 58 Q 74 62 86 60');
        _cejas.der.setAttribute('d', 'M 114 60 Q 126 62 138 58');
    }

    // ============================================================
    // 11. ESTADOS (con más animaciones)
    // ============================================================
    function aplicarEstado(estado) {
        if (!_activo) return;
        _estadoActual = estado;
        if (!_cuerpoEl) return;

        _cuerpoEl.style.transition = 'transform 0.4s ease-in-out';
        _cuerpoEl.style.transformOrigin = '100px 190px';

        switch (estado) {
            case 'idle':
                _cuerpoEl.style.transform = 'scale(1) rotate(0deg)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 0)';
                    _pupilas.der.style.transform = 'translate(0, 0)';
                }
                cejasNormales();
                dejarDePensar();
                break;

            case 'escuchando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'rotate(-4deg)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -1px)';
                    _pupilas.der.style.transform = 'translate(0, -1px)';
                }
                cejasSorprendidas();
                break;

            case 'pensando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'translateY(-3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, -3px)';
                    _pupilas.der.style.transform = 'translate(0, -3px)';
                }
                cejasPensativas();
                pensarConMano();
                break;

            case 'feliz':
                cejasFelices();
                festejar();
                break;

            case 'triste':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'translateY(3px)';
                if (_pupilas.izq) {
                    _pupilas.izq.style.transform = 'translate(0, 2px)';
                    _pupilas.der.style.transform = 'translate(0, 2px)';
                }
                cejasTristes();
                break;

            case 'hablando':
                // gesticular se llama en cada visema desde pet.js
                break;
        }
    }

    // ============================================================
    // API
    // ============================================================
    function iniciar() {
        if (_activo) return;
        _activo = true;
        capturarElementos();
        loopRespiracion();
        loopParpadeo();
        mirarAlrededor();
        console.log('[Marquinhos/Anim] ✅ Galactic v2.0 activo');
    }

    function detener() {
        _activo = false;
        limpiarTimers();
        _parpadeando = false;
        _respirando = false;
        if (_ojos.izq && _ojos.der) {
            _ojos.izq.setAttribute('ry', '17');
            _ojos.der.setAttribute('ry', '17');
        }
        if (_cuerpoEl) {
            _cuerpoEl.style.transition = 'none';
            _cuerpoEl.style.transform = 'scale(1) rotate(0deg) translateY(0)';
        }
    }

    function setEstado(estado) { aplicarEstado(estado); }
    function anticipar() { anticiparHabla(); }
    function squash() { squashHablar(); }
    function gesto() { gesticular(); }
    function hola() { saludar(); }
    function festejo() { festejar(); }

    window.MarquinhosAnim = {
        iniciar: iniciar,
        detener: detener,
        reiniciar: function() { detener(); setTimeout(iniciar, 100); },
        setEstado: setEstado,
        anticipar: anticipar,
        squash: squash,
        gesticular: gesto,
        saludar: hola,
        festejar: festejo
    };

    console.log('[Marquinhos/Anim] Módulo v2.0 Galactic cargado');
})();