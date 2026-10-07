// ================================================================
// MARQUINHOS · ANIMACIONES v2.3 "Galactic Pro"
// Manos y piernas con pivote correcto (ya no se sueltan ni giran)
// Gestos con límite de frecuencia · rebote elástico suave
// Ojos, cabeza, manos y pies se mueven al hablar
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosAnim) return;

    // Pivotes en unidades del SVG (viewBox 200x260)
    var ORIGEN = {
        brazoIzq:  '60px 180px',   // hombro
        brazoDer:  '140px 180px',
        manoIzq:   '18px 228px',   // muñeca
        manoDer:   '182px 228px',
        piernaIzq: '82px 250px',   // cadera
        piernaDer: '118px 250px',
        cabeza:    '100px 160px',  // base del cuello
        ojoIzq:    '72px 108px',
        ojoDer:    '128px 108px',
        cuerpo:    '100px 200px'
    };

    // Rebote elástico SUAVE (sobrepasa un poco y vuelve, sin girar de más)
    var ELASTICO   = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
    var ELASTICO_L = 'cubic-bezier(0.25, 1.3, 0.5, 1)';

    var GESTO_MIN_MS = 900; // mínimo entre gestos de brazos

    var _activo = false;
    var _timers = [];
    var _parpadeando = false;
    var _respirando = false;
    var _estadoActual = 'idle';
    var _loopHablaOn = false;
    var _ultimoGesto = 0;
    var _pasoPies = 0;

    var _cuerpoEl = null;
    var _cabezaEl = null;
    var _ojos = { izq: null, der: null };
    var _pupilas = { izq: null, der: null };
    var _cejas = { izq: null, der: null };
    var _brazos = { izq: null, der: null };
    var _manos = { izq: null, der: null };
    var _piernas = { izq: null, der: null };

    function el(id) { return document.getElementById(id); }

    function capturarElementos() {
        _cuerpoEl = el('mq-cuerpo');
        _cabezaEl = el('mq-cabeza-grupo');
        _ojos = { izq: el('mq-ojo-izq'), der: el('mq-ojo-der') };
        _pupilas = { izq: el('mq-pupila-izq'), der: el('mq-pupila-der') };
        _cejas = { izq: el('mq-ceja-izq'), der: el('mq-ceja-der') };
        _brazos = { izq: el('mq-brazo-izq'), der: el('mq-brazo-der') };
        _manos = { izq: el('mq-mano-izq'), der: el('mq-mano-der') };
        _piernas = { izq: el('mq-pierna-izq'), der: el('mq-pierna-der') };
        aplicarPivotes();
    }

    // Fija el punto de giro de cada parte. Esto arregla las manos que
    // "se caían": antes giraban alrededor del centro de todo el dibujo.
    function aplicarPivotes() {
        function p(e, o) { if (e) e.style.transformOrigin = o; }
        p(_cuerpoEl, ORIGEN.cuerpo);
        p(_cabezaEl, ORIGEN.cabeza);
        p(_ojos.izq, ORIGEN.ojoIzq);
        p(_ojos.der, ORIGEN.ojoDer);
        p(_brazos.izq, ORIGEN.brazoIzq);
        p(_brazos.der, ORIGEN.brazoDer);
        p(_manos.izq, ORIGEN.manoIzq);
        p(_manos.der, ORIGEN.manoDer);
        p(_piernas.izq, ORIGEN.piernaIzq);
        p(_piernas.der, ORIGEN.piernaDer);
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

    function tr(e, valor, dur, easing) {
        if (!e) return;
        e.style.transition = 'transform ' + dur + 's ' + (easing || ELASTICO);
        e.style.transform = valor;
    }

    // ------------------------------------------------------------
    // RESPIRACIÓN
    // ------------------------------------------------------------
    function respirar() {
        if (!_activo || _respirando) return;
        _respirando = true;
        if (!_cuerpoEl) { _respirando = false; return; }
        if (_estadoActual !== 'idle') { _respirando = false; return; }

        tr(_cuerpoEl, 'scale(1.015)', 1.8, 'ease-in-out');
        programar(function() {
            if (!_activo) return;
            if (_estadoActual === 'idle') tr(_cuerpoEl, 'scale(1)', 1.8, 'ease-in-out');
            programar(function() { _respirando = false; }, 1800);
        }, 1800);
    }

    function loopRespiracion() {
        if (!_activo) return;
        respirar();
        programar(loopRespiracion, 4200);
    }

    // ------------------------------------------------------------
    // CABEZA
    // ------------------------------------------------------------
    // Balanceo suave en reposo
    function cabecear() {
        if (!_activo) return;
        if (_estadoActual !== 'idle' || !_cabezaEl) {
            programar(cabecear, 3000);
            return;
        }
        var angulo = (Math.random() - 0.5) * 8; // -4° a +4°
        tr(_cabezaEl, 'rotate(' + angulo + 'deg)', 1.1, ELASTICO_L);
        programar(function() {
            if (_estadoActual === 'idle') tr(_cabezaEl, 'rotate(0deg)', 1.1, ELASTICO_L);
        }, 1600);
        programar(cabecear, 4000 + Math.random() * 3000);
    }

    // Cabeceo al hablar (asiente y se inclina)
    function cabeceoHabla() {
        if (!_cabezaEl) return;
        var ang = (Math.random() - 0.5) * 9;           // -4.5° a +4.5°
        var sube = -(1 + Math.random() * 2);            // sube 1–3 px
        tr(_cabezaEl, 'translateY(' + sube + 'px) rotate(' + ang + 'deg)', 0.35, ELASTICO);
        programar(function() {
            if (_estadoActual === 'hablando') tr(_cabezaEl, 'translateY(0px) rotate(0deg)', 0.45, ELASTICO);
        }, 380);
    }

    // ------------------------------------------------------------
    // OJOS
    // ------------------------------------------------------------
    function parpadear() {
        if (!_activo || _parpadeando) return;
        if (!_ojos.izq || !_ojos.der) return;
        _parpadeando = true;

        tr(_ojos.izq, 'scaleY(0.08)', 0.08, 'ease-out');
        tr(_ojos.der, 'scaleY(0.08)', 0.08, 'ease-out');

        programar(function() {
            if (!_activo) return;
            tr(_ojos.izq, 'scaleY(1)', 0.18, ELASTICO);
            tr(_ojos.der, 'scaleY(1)', 0.18, ELASTICO);
            programar(function() { _parpadeando = false; }, 220);
        }, 120);
    }

    function loopParpadeo() {
        if (!_activo) return;
        if (_estadoActual !== 'pensando') parpadear();
        programar(loopParpadeo, 2000 + Math.random() * 2000);
    }

    function moverPupilas(dx, dy, dur) {
        if (!_pupilas.izq || !_pupilas.der) return;
        var t = 'transform ' + dur + 's ' + ELASTICO;
        _pupilas.izq.style.transition = t;
        _pupilas.der.style.transition = t;
        var v = 'translate(' + dx + 'px, ' + dy + 'px)';
        _pupilas.izq.style.transform = v;
        _pupilas.der.style.transform = v;
    }

    function mirarAlrededor() {
        if (!_activo) return;
        if (_estadoActual !== 'idle') {
            programar(mirarAlrededor, 2000);
            return;
        }
        moverPupilas((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, 0.7);
        programar(mirarAlrededor, 2000 + Math.random() * 2500);
    }

    // ------------------------------------------------------------
    // CUERPO
    // ------------------------------------------------------------
    function anticiparHabla() {
        if (!_cuerpoEl) return;
        tr(_cuerpoEl, 'scale(1.05)', 0.25, 'ease-out');
        programar(function() {
            if (_estadoActual === 'hablando') tr(_cuerpoEl, 'scale(1.01)', 0.35, ELASTICO);
        }, 300);
    }

    function squashHablar() {
        if (!_cuerpoEl) return;
        tr(_cuerpoEl, 'scale(1.025, 0.985)', 0.15, 'ease-out');
        programar(function() {
            if (_estadoActual === 'hablando') tr(_cuerpoEl, 'scale(0.99, 1.015)', 0.18, 'ease-in-out');
            programar(function() {
                if (_estadoActual === 'hablando') tr(_cuerpoEl, 'scale(1.01)', 0.2, ELASTICO);
            }, 180);
        }, 150);
    }

    // ------------------------------------------------------------
    // BRAZOS Y MANOS
    // ------------------------------------------------------------
    var _gestoActual = 0;
    // Positivo en el brazo izquierdo / negativo en el derecho = hacia afuera y arriba
    var GESTOS = [
        { izq: 24, der: -10 },
        { izq: 10, der: -26 },
        { izq: 30, der: -30 },
        { izq: 8,  der: -8  }
    ];

    function gesticular() {
        if (!_activo) return;
        if (_estadoActual !== 'hablando' && _estadoActual !== 'escuchando') return;
        if (!_brazos.izq || !_brazos.der || !_manos.izq || !_manos.der) return;

        // Límite de frecuencia: evita la sacudida rápida
        var ahora = Date.now();
        if (ahora - _ultimoGesto < GESTO_MIN_MS) return;
        _ultimoGesto = ahora;

        var g = GESTOS[_gestoActual++ % GESTOS.length];

        tr(_brazos.izq, 'rotate(' + g.izq + 'deg)', 0.4, ELASTICO);
        tr(_brazos.der, 'rotate(' + g.der + 'deg)', 0.4, ELASTICO);
        // La mano gira un poco en sentido contrario, siempre sobre la muñeca
        tr(_manos.izq, 'rotate(' + (-g.izq / 3) + 'deg)', 0.45, ELASTICO);
        tr(_manos.der, 'rotate(' + (-g.der / 3) + 'deg)', 0.45, ELASTICO);

        programar(function() {
            if (!_brazos.izq) return;
            tr(_brazos.izq, 'rotate(0deg)', 0.55, ELASTICO_L);
            tr(_brazos.der, 'rotate(0deg)', 0.55, ELASTICO_L);
            tr(_manos.izq, 'rotate(0deg)', 0.55, ELASTICO_L);
            tr(_manos.der, 'rotate(0deg)', 0.55, ELASTICO_L);
        }, 480);
    }

    function saludar() {
        if (!_activo) return;
        if (!_brazos.der || !_manos.der) return;

        tr(_brazos.der, 'rotate(-70deg)', 0.45, ELASTICO);

        var movimientos = 0;
        function ondear() {
            if (!_activo) return;
            if (movimientos >= 5) {
                tr(_manos.der, 'rotate(0deg)', 0.25, 'ease-out');
                tr(_brazos.der, 'rotate(0deg)', 0.55, ELASTICO_L);
                return;
            }
            tr(_manos.der, movimientos % 2 === 0 ? 'rotate(22deg)' : 'rotate(-22deg)', 0.18, 'ease-in-out');
            movimientos++;
            programar(ondear, 190);
        }
        programar(ondear, 300);
    }

    function festejar() {
        if (!_activo) return;
        if (!_cuerpoEl || !_brazos.izq || !_brazos.der) return;

        tr(_cuerpoEl, 'scale(1.08) translateY(-16px)', 0.3, ELASTICO);
        tr(_brazos.izq, 'rotate(70deg)', 0.4, ELASTICO);
        tr(_brazos.der, 'rotate(-70deg)', 0.4, ELASTICO);
        tr(_piernas.izq, 'rotate(-7deg)', 0.3, ELASTICO);
        tr(_piernas.der, 'rotate(7deg)', 0.3, ELASTICO);

        programar(function() { tr(_cuerpoEl, 'scale(1) translateY(0)', 0.45, ELASTICO); }, 500);
        programar(function() {
            tr(_brazos.izq, 'rotate(0deg)', 0.5, ELASTICO_L);
            tr(_brazos.der, 'rotate(0deg)', 0.5, ELASTICO_L);
            tr(_piernas.izq, 'rotate(0deg)', 0.5, ELASTICO_L);
            tr(_piernas.der, 'rotate(0deg)', 0.5, ELASTICO_L);
        }, 850);
    }

    function pensarConMano() {
        if (!_activo || !_brazos.der) return;
        tr(_brazos.der, 'rotate(-135deg)', 0.55, ELASTICO_L);
    }

    function dejarDePensar() {
        if (!_brazos.der) return;
        tr(_brazos.der, 'rotate(0deg)', 0.45, ELASTICO_L);
    }

    // ------------------------------------------------------------
    // PIES
    // ------------------------------------------------------------
    // Pequeño paso alternado al hablar (rotación corta sobre la cadera)
    function pasoPies() {
        if (!_piernas.izq || !_piernas.der) return;
        _pasoPies++;
        var a = (_pasoPies % 2 === 0) ? 5 : -5;
        tr(_piernas.izq, 'rotate(' + a + 'deg)', 0.35, ELASTICO);
        tr(_piernas.der, 'rotate(' + (-a) + 'deg)', 0.35, ELASTICO);
    }

    function pliesReposo() {
        tr(_piernas.izq, 'rotate(0deg)', 0.45, ELASTICO_L);
        tr(_piernas.der, 'rotate(0deg)', 0.45, ELASTICO_L);
    }

    // ------------------------------------------------------------
    // CEJAS (base inclinada hacia el centro = mirada más seria)
    // ------------------------------------------------------------
    function cejas(izq, der) {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', izq);
        _cejas.der.setAttribute('d', der);
    }
    function cejasNormales()     { cejas('M 56 80 Q 72 74 88 83', 'M 112 83 Q 128 74 144 80'); }
    function cejasSorprendidas() { cejas('M 58 73 Q 72 66 86 72', 'M 114 72 Q 128 66 142 73'); }
    function cejasPensativas()   { cejas('M 58 78 Q 72 71 86 74', 'M 114 78 Q 128 70 142 78'); }
    function cejasFelices()      { cejas('M 58 76 Q 72 69 86 75', 'M 114 75 Q 128 69 142 76'); }
    function cejasTristes()      { cejas('M 58 76 Q 72 80 86 78', 'M 114 78 Q 128 80 142 76'); }

    // ------------------------------------------------------------
    // LOOP DE HABLA: cabeza, brazos, pies, ojos y cuerpo se mueven
    // con ritmo suave (cada ~0.7–1 s), NO en cada sílaba.
    // ------------------------------------------------------------
    function loopHabla() {
        if (!_activo || _estadoActual !== 'hablando') { _loopHablaOn = false; return; }
        _loopHablaOn = true;

        gesticular();
        cabeceoHabla();
        pasoPies();
        squashHablar();
        moverPupilas((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 0.3);

        programar(loopHabla, 750 + Math.random() * 300);
    }

    // ------------------------------------------------------------
    // ESTADOS
    // ------------------------------------------------------------
    function aplicarEstado(estado) {
        if (!_activo) return;
        var anterior = _estadoActual;
        _estadoActual = estado;
        if (!_cuerpoEl) return;

        // Al salir de "hablando" devolvemos cabeza y pies a su sitio
        if (anterior === 'hablando' && estado !== 'hablando') {
            tr(_cabezaEl, 'rotate(0deg)', 0.5, ELASTICO_L);
            pliesReposo();
        }

        switch (estado) {
            case 'idle':
                tr(_cuerpoEl, 'scale(1) rotate(0deg)', 0.5, ELASTICO_L);
                tr(_cabezaEl, 'rotate(0deg)', 0.5, ELASTICO_L);
                moverPupilas(0, 0, 0.4);
                tr(_brazos.izq, 'rotate(0deg)', 0.5, ELASTICO_L);
                tr(_manos.izq, 'rotate(0deg)', 0.5, ELASTICO_L);
                tr(_manos.der, 'rotate(0deg)', 0.5, ELASTICO_L);
                pliesReposo();
                cejasNormales();
                dejarDePensar();
                break;

            case 'escuchando':
                tr(_cuerpoEl, 'rotate(-3deg)', 0.6, ELASTICO);
                tr(_cabezaEl, 'rotate(4deg)', 0.6, ELASTICO);
                moverPupilas(0, 0, 0.3);
                cejasSorprendidas();
                dejarDePensar();
                break;

            case 'pensando':
                tr(_cuerpoEl, 'translateY(-3px)', 0.6, ELASTICO);
                tr(_cabezaEl, 'rotate(-3deg)', 0.6, ELASTICO);
                moverPupilas(-2, -2, 0.4);
                cejasPensativas();
                pensarConMano();
                break;

            case 'feliz':
                cejasFelices();
                festejar();
                break;

            case 'triste':
                tr(_cuerpoEl, 'translateY(3px)', 0.6, ELASTICO_L);
                cejasTristes();
                break;

            case 'hablando':
                // Suelta la mano de pensar si venía de ahí
                dejarDePensar();
                tr(_cuerpoEl, 'scale(1.01)', 0.3, ELASTICO);
                cejasNormales();
                if (!_loopHablaOn) {
                    _loopHablaOn = true;
                    programar(loopHabla, 200);
                }
                break;
        }
    }

    // ------------------------------------------------------------
    // CONTROL
    // ------------------------------------------------------------
    function iniciar() {
        if (_activo) return;
        _activo = true;
        capturarElementos();
        loopRespiracion();
        loopParpadeo();
        mirarAlrededor();
        cabecear();
        console.log('[Marquinhos/Anim] ✅ Galactic Pro v2.3 activo');
    }

    function detener() {
        _activo = false;
        _loopHablaOn = false;
        limpiarTimers();
        _parpadeando = false;
        _respirando = false;
        function reset(e, v) { if (e) { e.style.transition = 'none'; e.style.transform = v; } }
        reset(_ojos.izq, 'scaleY(1)');
        reset(_ojos.der, 'scaleY(1)');
        reset(_cuerpoEl, 'scale(1) rotate(0deg) translateY(0)');
        reset(_cabezaEl, 'rotate(0deg)');
        reset(_brazos.izq, 'rotate(0deg)');
        reset(_brazos.der, 'rotate(0deg)');
        reset(_manos.izq, 'rotate(0deg)');
        reset(_manos.der, 'rotate(0deg)');
        reset(_piernas.izq, 'rotate(0deg)');
        reset(_piernas.der, 'rotate(0deg)');
    }

    window.MarquinhosAnim = {
        iniciar: iniciar,
        detener: detener,
        reiniciar: function() { detener(); setTimeout(iniciar, 100); },
        setEstado: aplicarEstado,
        anticipar: anticiparHabla,
        squash: squashHablar,
        gesticular: gesticular,
        saludar: saludar,
        festejar: festejar
    };

    console.log('[Marquinhos/Anim] Módulo v2.3 Galactic Pro cargado');
})();
