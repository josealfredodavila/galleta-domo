// ================================================================
// MARQUINHOS · ANIMACIONES v2.2 "Galactic Pro"
// Manos/pies más elásticos + cabeza con balanceo
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
    var _cabezaEl = null;
    var _ojos = null;
    var _pupilas = null;
    var _cejas = null;
    var _brazos = null;
    var _manos = null;
    var _piernas = null;

    function capturarElementos() {
        _cuerpoEl = document.getElementById('mq-cuerpo');
        _cabezaEl = document.getElementById('mq-cabeza-grupo');
        _ojos = {
            izq: document.getElementById('mq-ojo-izq'),
            der: document.getElementById('mq-ojo-der')
        };
        _pupilas = {
            izq: document.getElementById('mq-pupila-izq'),
            der: document.getElementById('mq-pupila-der')
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

    // RESPIRACIÓN
    function respirar() {
        if (!_activo || _respirando) return;
        _respirando = true;
        if (!_cuerpoEl) { _respirando = false; return; }

        _cuerpoEl.style.transition = 'transform 1.8s ease-in-out';
        _cuerpoEl.style.transform = 'scale(1.015)';
        _cuerpoEl.style.transformOrigin = '100px 200px';

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

    // ✅ v2.2: Cabeceo suave en idle
    function cabecear() {
        if (!_activo) return;
        if (_estadoActual !== 'idle') {
            programar(cabecear, 3000);
            return;
        }
        if (!_cabezaEl) {
            programar(cabecear, 3000);
            return;
        }

        // Balanceo lateral suave de la cabeza
        var angulo = (Math.random() - 0.5) * 6; // -3° a +3°
        _cabezaEl.style.transition = 'transform 1.2s ease-in-out';
        _cabezaEl.style.transformOrigin = '100px 100px';
        _cabezaEl.style.transform = 'rotate(' + angulo + 'deg)';

        programar(function() {
            if (!_cabezaEl) return;
            _cabezaEl.style.transform = 'rotate(0deg)';
        }, 1500);

        programar(cabecear, 4000 + Math.random() * 3000);
    }

    // PARPADEO
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
        var delay = 2000 + Math.random() * 2000;
        programar(loopParpadeo, delay);
    }

    // MIRADA
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

        var delay = 2000 + Math.random() * 2500;
        programar(mirarAlrededor, delay);
    }

    // ANTICIPACIÓN
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

    // SQUASH
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

    // ✅ v2.2: GESTICULAR con movimiento ELÁSTICO
    var _gestoActual = 0;
    function gesticular() {
        if (!_activo) return;
        if (_estadoActual !== 'hablando' && _estadoActual !== 'escuchando') return;
        if (!_brazos.izq || !_brazos.der || !_manos.izq || !_manos.der) return;

        _gestoActual++;
        var trans = 'transform 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55)'; // Elástico
        _brazos.izq.style.transition = trans;
        _brazos.der.style.transition = trans;
        _manos.izq.style.transition = trans;
        _manos.der.style.transition = trans;
        _brazos.izq.style.transformOrigin = '60px 180px';
        _brazos.der.style.transformOrigin = '140px 180px';

        var g = _gestoActual % 4;
        var anguloIzq = 0, anguloDer = 0;
        if (g === 0) { anguloIzq = 18; anguloDer = -18; }
        else if (g === 1) { anguloIzq = -12; anguloDer = 12; }
        else if (g === 2) { anguloIzq = 22; anguloDer = -22; }
        else { anguloIzq = -10; anguloDer = 10; }

        _brazos.izq.style.transform = 'rotate(' + anguloIzq + 'deg)';
        _brazos.der.style.transform = 'rotate(' + anguloDer + 'deg)';
        // Manos también rotan un poco para más naturalidad
        _manos.izq.style.transform = 'rotate(' + (-anguloIzq / 2) + 'deg)';
        _manos.der.style.transform = 'rotate(' + (-anguloDer / 2) + 'deg)';

        programar(function() {
            if (!_brazos.izq) return;
            var backTrans = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
            _brazos.izq.style.transition = backTrans;
            _brazos.der.style.transition = backTrans;
            _manos.izq.style.transition = backTrans;
            _manos.der.style.transition = backTrans;
            _brazos.izq.style.transform = 'rotate(0deg)';
            _brazos.der.style.transform = 'rotate(0deg)';
            _manos.izq.style.transform = 'rotate(0deg)';
            _manos.der.style.transform = 'rotate(0deg)';
        }, 400);
    }

    // SALUDAR
    function saludar() {
        if (!_activo) return;
        if (!_brazos.der || !_manos.der) return;

        _brazos.der.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.der.style.transformOrigin = '140px 180px';
        _brazos.der.style.transform = 'rotate(-70deg)';

        var movimientos = 0;
        function ondear() {
            if (movimientos >= 5) {
                _brazos.der.style.transition = 'transform 0.5s ease-in-out';
                _brazos.der.style.transform = 'rotate(0deg)';
                return;
            }
            _manos.der.style.transition = 'transform 0.18s ease-in-out';
            _manos.der.style.transform = movimientos % 2 === 0 ? 'rotate(25deg)' : 'rotate(-25deg)';
            movimientos++;
            programar(ondear, 180);
        }
        ondear();
    }

    // FESTEJAR (con salto y manos arriba)
    function festejar() {
        if (!_activo) return;
        if (!_cuerpoEl || !_brazos.izq || !_brazos.der) return;

        _cuerpoEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _cuerpoEl.style.transform = 'scale(1.1) translateY(-18px)';
        _cuerpoEl.style.transformOrigin = '100px 200px';

        _brazos.izq.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.der.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
        _brazos.izq.style.transformOrigin = '60px 180px';
        _brazos.der.style.transformOrigin = '140px 180px';
        _brazos.izq.style.transform = 'rotate(80deg)';
        _brazos.der.style.transform = 'rotate(-80deg)';

        // Piernas también saltan un poco
        if (_piernas.izq && _piernas.der) {
            _piernas.izq.style.transition = 'transform 0.3s ease-out';
            _piernas.der.style.transition = 'transform 0.3s ease-out';
            _piernas.izq.style.transformOrigin = '82px 250px';
            _piernas.der.style.transformOrigin = '118px 250px';
            _piernas.izq.style.transform = 'rotate(-8deg)';
            _piernas.der.style.transform = 'rotate(8deg)';
        }

        programar(function() {
            _cuerpoEl.style.transform = 'scale(1) translateY(0)';
        }, 500);

        programar(function() {
            _brazos.izq.style.transform = 'rotate(0deg)';
            _brazos.der.style.transform = 'rotate(0deg)';
            if (_piernas.izq) {
                _piernas.izq.style.transform = 'rotate(0deg)';
                _piernas.der.style.transform = 'rotate(0deg)';
            }
        }, 800);
    }

    // PENSAR
    function pensarConMano() {
        if (!_activo) return;
        if (!_brazos.der) return;
        _brazos.der.style.transition = 'transform 0.5s ease-in-out';
        _brazos.der.style.transformOrigin = '140px 180px';
        _brazos.der.style.transform = 'rotate(-135deg)';
    }

    function dejarDePensar() {
        if (!_brazos.der) return;
        _brazos.der.style.transition = 'transform 0.4s ease-in-out';
        _brazos.der.style.transform = 'rotate(0deg)';
    }

    // CEJAS
    function cejasNormales() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 60 78 Q 72 73 84 78');
        _cejas.der.setAttribute('d', 'M 116 78 Q 128 73 140 78');
    }
    function cejasSorprendidas() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 60 73 Q 72 65 84 73');
        _cejas.der.setAttribute('d', 'M 116 73 Q 128 65 140 73');
    }
    function cejasPensativas() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 60 76 Q 72 70 84 74');
        _cejas.der.setAttribute('d', 'M 116 74 Q 128 70 140 76');
    }
    function cejasFelices() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 60 76 Q 72 70 84 74');
        _cejas.der.setAttribute('d', 'M 116 74 Q 128 70 140 76');
    }
    function cejasTristes() {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', 'M 60 74 Q 72 78 84 76');
        _cejas.der.setAttribute('d', 'M 116 76 Q 128 78 140 74');
    }

    // ESTADOS
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
                cejasNormales();
                dejarDePensar();
                break;
            case 'escuchando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'rotate(-4deg)';
                cejasSorprendidas();
                break;
            case 'pensando':
                _cuerpoEl.style.transition = 'transform 0.6s ease-in-out';
                _cuerpoEl.style.transform = 'translateY(-3px)';
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
                cejasTristes();
                break;
            case 'hablando':
                break;
        }
    }

    function iniciar() {
        if (_activo) return;
        _activo = true;
        capturarElementos();
        loopRespiracion();
        loopParpadeo();
        mirarAlrededor();
        cabecear();  // ✅ v2.2: nuevo
        console.log('[Marquinhos/Anim] ✅ Galactic Pro v2.2 activo');
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
        if (_cabezaEl) {
            _cabezaEl.style.transform = 'rotate(0deg)';
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

    console.log('[Marquinhos/Anim] Módulo v2.2 Galactic Pro cargado');
})();