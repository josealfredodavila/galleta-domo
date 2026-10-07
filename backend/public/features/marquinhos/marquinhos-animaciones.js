// ================================================================
// MARQUINHOS · ANIMACIONES v2.4 "Galactic Pro"
// Brazos articulados: hombro > codo > muñeca > dedos
// Movimiento escalonado (cada parte llega un poco después que la anterior)
// = menos rígido, más fluido. Balanceo en reposo y gestos variados.
// ================================================================

'use strict';

(function() {
    if (window.MarquinhosAnim) return;

    // Pivotes en unidades del SVG (viewBox 200x260)
    var ORIGEN = {
        brazoIzq:  '60px 180px',   // hombro
        brazoDer:  '140px 180px',
        codoIzq:   '30px 205px',   // codo
        codoDer:   '170px 205px',
        manoIzq:   '18px 228px',   // muñeca
        manoDer:   '182px 228px',
        piernaIzq: '82px 250px',   // cadera
        piernaDer: '118px 250px',
        cabeza:    '100px 160px',  // base del cuello
        ojoIzq:    '72px 108px',
        ojoDer:    '128px 108px',
        cuerpo:    '100px 200px'
    };

    // Rebote elástico suave (sobrepasa un poco y se asienta)
    var ELASTICO   = 'cubic-bezier(0.34, 1.45, 0.64, 1)';
    var ELASTICO_L = 'cubic-bezier(0.25, 1.3, 0.5, 1)';

    var GESTO_MIN_MS = 900;

    var _activo = false;
    var _timers = [];
    var _parpadeando = false;
    var _respirando = false;
    var _estadoActual = 'idle';
    var _loopHablaOn = false;
    var _ultimoGesto = 0;
    var _ultimoTipoGesto = -1;
    var _pasoPies = 0;
    var _timerRetorno = null;

    var _cuerpoEl = null;
    var _cabezaEl = null;
    var _ojos = { izq: null, der: null };
    var _pupilas = { izq: null, der: null };
    var _cejas = { izq: null, der: null };
    var _brazos = { izq: null, der: null };
    var _antebrazos = { izq: null, der: null };
    var _manos = { izq: null, der: null };
    var _dedos = { izq: [], der: [] };
    var _piernas = { izq: null, der: null };

    function el(id) { return document.getElementById(id); }

    function capturarElementos() {
        _cuerpoEl = el('mq-cuerpo');
        _cabezaEl = el('mq-cabeza-grupo');
        _ojos = { izq: el('mq-ojo-izq'), der: el('mq-ojo-der') };
        _pupilas = { izq: el('mq-pupila-izq'), der: el('mq-pupila-der') };
        _cejas = { izq: el('mq-ceja-izq'), der: el('mq-ceja-der') };
        _brazos = { izq: el('mq-brazo-izq'), der: el('mq-brazo-der') };
        _antebrazos = { izq: el('mq-antebrazo-izq'), der: el('mq-antebrazo-der') };
        _manos = { izq: el('mq-mano-izq'), der: el('mq-mano-der') };
        _piernas = { izq: el('mq-pierna-izq'), der: el('mq-pierna-der') };
        _dedos = { izq: leerDedos(_manos.izq), der: leerDedos(_manos.der) };
        aplicarPivotes();
    }

    // Cada dedo guarda su base (data-o) y hacia dónde se abre (data-s)
    function leerDedos(mano) {
        var out = [];
        if (!mano) return out;
        var nodos = mano.querySelectorAll('.mq-dedo');
        for (var i = 0; i < nodos.length; i++) {
            var o = (nodos[i].getAttribute('data-o') || '0 0').split(' ');
            out.push({
                el: nodos[i],
                s: parseFloat(nodos[i].getAttribute('data-s') || '0'),
                ox: o[0], oy: o[1]
            });
        }
        return out;
    }

    // Fija el punto de giro de cada parte
    function aplicarPivotes() {
        function p(e, o) { if (e) e.style.transformOrigin = o; }
        p(_cuerpoEl, ORIGEN.cuerpo);
        p(_cabezaEl, ORIGEN.cabeza);
        p(_ojos.izq, ORIGEN.ojoIzq);
        p(_ojos.der, ORIGEN.ojoDer);
        p(_brazos.izq, ORIGEN.brazoIzq);
        p(_brazos.der, ORIGEN.brazoDer);
        p(_antebrazos.izq, ORIGEN.codoIzq);
        p(_antebrazos.der, ORIGEN.codoDer);
        p(_manos.izq, ORIGEN.manoIzq);
        p(_manos.der, ORIGEN.manoDer);
        p(_piernas.izq, ORIGEN.piernaIzq);
        p(_piernas.der, ORIGEN.piernaDer);
        ['izq', 'der'].forEach(function(lado) {
            _dedos[lado].forEach(function(d) {
                d.el.style.transformOrigin = d.ox + 'px ' + d.oy + 'px';
            });
        });
    }

    function limpiarTimers() {
        _timers.forEach(function(t) { clearTimeout(t); });
        _timers = [];
        _timerRetorno = null;
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
    // BRAZOS: hombro > codo > muñeca > dedos
    // Las poses se escriben para el brazo IZQUIERDO; el derecho se
    // espeja solo. h=hombro, c=codo, m=muñeca (grados), d=dedos.
    // Positivo = hacia afuera/arriba.
    // ------------------------------------------------------------
    var REPOSO = { h: 0, c: 0, m: 0, d: 'relajado' };

    var DEDOS_ESTADO = {
        relajado: { abre: 4,  escala: 0.95 },
        abierto:  { abre: 16, escala: 1.1 },
        curvo:    { abre: -6, escala: 0.8 }
    };

    function posarDedos(lado, estado, dur, easing) {
        var cfg = DEDOS_ESTADO[estado] || DEDOS_ESTADO.relajado;
        _dedos[lado].forEach(function(d, i) {
            // Cada dedo arranca un poquito después: efecto de "ola"
            programar(function() {
                tr(d.el, 'rotate(' + (d.s * cfg.abre) + 'deg) scale(' + cfg.escala + ')', dur, easing);
            }, i * 28);
        });
    }

    // lag = retraso entre articulaciones (ms). Esto da el movimiento "suelto".
    function posarBrazo(lado, p, dur, easing, lag) {
        if (!_brazos[lado]) return;
        var k = (lado === 'izq') ? 1 : -1;
        var l = (lag == null) ? 70 : lag;
        easing = easing || ELASTICO;

        tr(_brazos[lado], 'rotate(' + (k * p.h) + 'deg)', dur, easing);
        programar(function() {
            tr(_antebrazos[lado], 'rotate(' + (k * p.c) + 'deg)', dur, easing);
        }, l);
        programar(function() {
            tr(_manos[lado], 'rotate(' + (k * p.m) + 'deg)', dur, easing);
            posarDedos(lado, p.d || 'relajado', dur, easing);
        }, l * 2);
    }

    function brazosReposo(dur, lag) {
        posarBrazo('izq', REPOSO, dur || 0.6, ELASTICO_L, lag);
        posarBrazo('der', REPOSO, dur || 0.6, ELASTICO_L, lag);
    }

    // Gestos al hablar: [brazo izquierdo, brazo derecho]
    var GESTOS = [
        // abrir los brazos
        [{ h: 22, c: 30, m: 10, d: 'abierto' },  { h: 22, c: 30, m: 10, d: 'abierto' }],
        // enfatizar con la derecha
        [{ h: 6,  c: 10, m: 0,  d: 'relajado' }, { h: 34, c: 62, m: 20, d: 'abierto' }],
        // enfatizar con la izquierda
        [{ h: 34, c: 62, m: 20, d: 'abierto' },  { h: 6,  c: 10, m: 0,  d: 'relajado' }],
        // encogerse de hombros, palmas arriba
        [{ h: 14, c: 48, m: -14, d: 'abierto' }, { h: 14, c: 48, m: -14, d: 'abierto' }],
        // balanceo asimétrico
        [{ h: 12, c: 22, m: 8,  d: 'relajado' }, { h: 2,  c: 12, m: -4, d: 'curvo' }]
    ];

    function gesticular() {
        if (!_activo) return;
        if (_estadoActual !== 'hablando' && _estadoActual !== 'escuchando') return;
        if (!_brazos.izq || !_brazos.der) return;

        var ahora = Date.now();
        if (ahora - _ultimoGesto < GESTO_MIN_MS) return;
        _ultimoGesto = ahora;

        // Elige un gesto distinto al anterior
        var t;
        do { t = Math.floor(Math.random() * GESTOS.length); }
        while (t === _ultimoTipoGesto && GESTOS.length > 1);
        _ultimoTipoGesto = t;

        var g = GESTOS[t];
        // Si llega un gesto nuevo, cancelamos el regreso al reposo
        if (_timerRetorno) { clearTimeout(_timerRetorno); _timerRetorno = null; }

        posarBrazo('izq', g[0], 0.5, ELASTICO, 80);
        posarBrazo('der', g[1], 0.5, ELASTICO, 80);

        // A veces regresa al reposo, a veces se queda a medio camino
        _timerRetorno = programar(function() {
            if (_estadoActual === 'hablando' && Math.random() < 0.35) {
                posarBrazo('izq', { h: 5, c: 10, m: 0, d: 'relajado' }, 0.7, ELASTICO_L, 90);
                posarBrazo('der', { h: 5, c: 10, m: 0, d: 'relajado' }, 0.7, ELASTICO_L, 90);
            } else {
                brazosReposo(0.7, 90);
            }
        }, 950);
    }

    // Balanceo suave de brazos y dedos cuando está quieto
    function balanceoReposo() {
        if (!_activo) return;
        if (_estadoActual !== 'idle') { programar(balanceoReposo, 2500); return; }
        function r(a, b) { return a + Math.random() * (b - a); }
        posarBrazo('izq', { h: r(1, 5), c: r(3, 9), m: r(-6, 6), d: 'relajado' }, 1.3, ELASTICO_L, 140);
        posarBrazo('der', { h: r(1, 5), c: r(3, 9), m: r(-6, 6), d: 'relajado' }, 1.3, ELASTICO_L, 140);
        programar(balanceoReposo, 2600 + Math.random() * 2200);
    }

    function saludar() {
        if (!_activo) return;
        if (!_brazos.der) return;
        // Brazo derecho arriba, antebrazo vertical, mano abierta
        posarBrazo('der', { h: 70, c: 35, m: 0, d: 'abierto' }, 0.5, ELASTICO, 90);
        var movimientos = 0;
        function ondear() {
            if (!_activo) return;
            if (movimientos >= 6) {
                brazosReposo(0.7, 100);
                return;
            }
            var lado = (movimientos % 2 === 0) ? 1 : -1;
            // Ondea con el antebrazo y la muñeca (como saludar de verdad)
            tr(_antebrazos.der, 'rotate(' + (-(35 + lado * 22)) + 'deg)', 0.22, 'ease-in-out');
            tr(_manos.der, 'rotate(' + (lado * -18) + 'deg)', 0.22, 'ease-in-out');
            movimientos++;
            programar(ondear, 230);
        }
        programar(ondear, 650);
    }

    function festejar() {
        if (!_activo) return;
        if (!_cuerpoEl || !_brazos.izq || !_brazos.der) return;

        tr(_cuerpoEl, 'scale(1.08) translateY(-16px)', 0.3, ELASTICO);
        posarBrazo('izq', { h: 110, c: 25, m: 8, d: 'abierto' }, 0.45, ELASTICO, 70);
        posarBrazo('der', { h: 110, c: 25, m: 8, d: 'abierto' }, 0.45, ELASTICO, 70);
        tr(_piernas.izq, 'rotate(-7deg)', 0.3, ELASTICO);
        tr(_piernas.der, 'rotate(7deg)', 0.3, ELASTICO);

        programar(function() { tr(_cuerpoEl, 'scale(1) translateY(0)', 0.45, ELASTICO); }, 500);
        programar(function() {
            brazosReposo(0.7, 90);
            tr(_piernas.izq, 'rotate(0deg)', 0.5, ELASTICO_L);
            tr(_piernas.der, 'rotate(0deg)', 0.5, ELASTICO_L);
        }, 900);
    }

    function pensarConMano() {
        if (!_activo || !_brazos.der) return;
        posarBrazo('der', { h: 130, c: 140, m: -10, d: 'curvo' }, 0.6, ELASTICO_L, 100);
    }

    function dejarDePensar() {
        if (!_brazos.der) return;
        posarBrazo('der', REPOSO, 0.55, ELASTICO_L, 90);
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
    function cabecear() {
        if (!_activo) return;
        if (_estadoActual !== 'idle' || !_cabezaEl) {
            programar(cabecear, 3000);
            return;
        }
        var angulo = (Math.random() - 0.5) * 8;
        tr(_cabezaEl, 'rotate(' + angulo + 'deg)', 1.1, ELASTICO_L);
        programar(function() {
            if (_estadoActual === 'idle') tr(_cabezaEl, 'rotate(0deg)', 1.1, ELASTICO_L);
        }, 1600);
        programar(cabecear, 4000 + Math.random() * 3000);
    }

    function cabeceoHabla() {
        if (!_cabezaEl) return;
        var ang = (Math.random() - 0.5) * 9;
        var sube = -(1 + Math.random() * 2);
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
        programar(loopParpadeo, 1800 + Math.random() * 1700);
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
    // PIES
    // ------------------------------------------------------------
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
    // CEJAS
    // ------------------------------------------------------------
    function cejas(izq, der) {
        if (!_cejas.izq || !_cejas.der) return;
        _cejas.izq.setAttribute('d', izq);
        _cejas.der.setAttribute('d', der);
    }
    function cejasNormales()     { cejas('M 56 82 Q 72 73 88 78', 'M 112 78 Q 128 73 144 82'); }
    function cejasSorprendidas() { cejas('M 58 72 Q 72 64 86 69', 'M 114 69 Q 128 64 142 72'); }
    function cejasPensativas()   { cejas('M 58 80 Q 72 73 86 76', 'M 114 72 Q 128 66 142 74'); }
    function cejasFelices()      { cejas('M 58 78 Q 72 68 86 74', 'M 114 74 Q 128 68 142 78'); }
    function cejasTristes()      { cejas('M 58 76 Q 72 80 86 78', 'M 114 78 Q 128 80 142 76'); }

    // ------------------------------------------------------------
    // LOOP DE HABLA
    // ------------------------------------------------------------
    function loopHabla() {
        if (!_activo || _estadoActual !== 'hablando') { _loopHablaOn = false; return; }
        _loopHablaOn = true;

        gesticular();
        cabeceoHabla();
        pasoPies();
        squashHablar();
        moverPupilas((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 0.3);

        programar(loopHabla, 800 + Math.random() * 350);
    }

    // ------------------------------------------------------------
    // ESTADOS
    // ------------------------------------------------------------
    function aplicarEstado(estado) {
        if (!_activo) return;
        var anterior = _estadoActual;
        _estadoActual = estado;
        if (!_cuerpoEl) return;

        if (_timerRetorno && estado !== 'hablando') {
            clearTimeout(_timerRetorno);
            _timerRetorno = null;
        }

        if (anterior === 'hablando' && estado !== 'hablando') {
            tr(_cabezaEl, 'rotate(0deg)', 0.5, ELASTICO_L);
            pliesReposo();
        }

        switch (estado) {
            case 'idle':
                tr(_cuerpoEl, 'scale(1) rotate(0deg)', 0.5, ELASTICO_L);
                tr(_cabezaEl, 'rotate(0deg)', 0.5, ELASTICO_L);
                moverPupilas(0, 0, 0.4);
                pliesReposo();
                cejasNormales();
                brazosReposo(0.7, 90);
                break;

            case 'escuchando':
                tr(_cuerpoEl, 'rotate(-3deg)', 0.6, ELASTICO);
                tr(_cabezaEl, 'rotate(4deg)', 0.6, ELASTICO);
                moverPupilas(0, 0, 0.3);
                cejasSorprendidas();
                posarBrazo('izq', { h: 8, c: 24, m: 6, d: 'relajado' }, 0.7, ELASTICO_L, 90);
                posarBrazo('der', { h: 5, c: 8, m: 0, d: 'relajado' }, 0.7, ELASTICO_L, 90);
                break;

            case 'pensando':
                tr(_cuerpoEl, 'translateY(-3px)', 0.6, ELASTICO);
                tr(_cabezaEl, 'rotate(-3deg)', 0.6, ELASTICO);
                moverPupilas(-2, -2, 0.4);
                cejasPensativas();
                posarBrazo('izq', REPOSO, 0.5, ELASTICO_L, 90);
                pensarConMano();
                break;

            case 'feliz':
                cejasFelices();
                festejar();
                break;

            case 'triste':
                tr(_cuerpoEl, 'translateY(3px)', 0.6, ELASTICO_L);
                cejasTristes();
                brazosReposo(0.8, 100);
                break;

            case 'hablando':
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
        programar(balanceoReposo, 1500);
        console.log('[Marquinhos/Anim] ✅ Galactic Pro v2.4 activo');
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
        ['izq', 'der'].forEach(function(lado) {
            reset(_brazos[lado], 'rotate(0deg)');
            reset(_antebrazos[lado], 'rotate(0deg)');
            reset(_manos[lado], 'rotate(0deg)');
            reset(_piernas[lado], 'rotate(0deg)');
            _dedos[lado].forEach(function(d) { reset(d.el, 'rotate(0deg) scale(1)'); });
        });
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
        festejar: festejar,
        // Para pruebas: posar un brazo a mano ('izq' | 'der', {h,c,m,d})
        _posar: function(lado, pose) { posarBrazo(lado, pose, 0.01, 'linear', 0); }
    };

    console.log('[Marquinhos/Anim] Módulo v2.4 Galactic Pro cargado');
})();
