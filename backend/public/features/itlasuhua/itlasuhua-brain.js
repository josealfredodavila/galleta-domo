// ================================================================
// ITLASUHUA · BRAIN v3.0
// ================================================================
// Controla al Rey Itlasuhua al hablar:
// boca abierta, alas batiendo más fuerte y polvo arcoíris.
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaBrainLoaded) return;
    window.__itlasuhuaBrainLoaded = true;

    function log(msg) {
        console.log('[Itlasuhua/Brain]', msg);
    }

    let spitTimer = null;

    function setWings(talking) {
        const izq = document.querySelector('#itlasuhua-svg #ala-izq animateTransform');
        const der = document.querySelector('#itlasuhua-svg #ala-der animateTransform');

        if (izq) {
            izq.setAttribute('values', talking
                ? '0 240 300; -14 240 300; 0 240 300'
                : '0 240 300; -5 240 300; 0 240 300');
            izq.setAttribute('dur', talking ? '0.5s' : '2.6s');
        }

        if (der) {
            der.setAttribute('values', talking
                ? '0 360 300; 14 360 300; 0 360 300'
                : '0 360 300; 5 360 300; 0 360 300');
            der.setAttribute('dur', talking ? '0.5s' : '2.6s');
        }
    }

    function setClasses(talking) {
        const container = document.getElementById('itlasuhua-container');
        const svg = document.getElementById('itlasuhua-svg');
        if (container) container.classList.toggle('is-talking', talking);
        if (svg) svg.classList.toggle('is-talking', talking);
    }

    const ItlasuhuaBrain = {

        isTalking: false,

        startTalking() {
            if (this.isTalking) return;
            this.isTalking = true;

            setClasses(true);
            setWings(true);

            if (window.ItlasuhuaPet && window.ItlasuhuaPet.spit) {
                window.ItlasuhuaPet.spit(8, 1);
                clearInterval(spitTimer);
                spitTimer = setInterval(() => {
                    window.ItlasuhuaPet.spit(3, 0.8);
                }, 260);
            }

            log('Hablando: boca, alas y polvo activados.');
        },

        stopTalking() {
            this.isTalking = false;

            clearInterval(spitTimer);
            spitTimer = null;

            setClasses(false);
            setWings(false);

            log('En reposo.');
        },

        toggleTalking() {
            if (this.isTalking) {
                this.stopTalking();
            } else {
                this.startTalking();
            }
        },

        reset() {
            this.stopTalking();
        }
    };

    window.ItlasuhuaBrain = ItlasuhuaBrain;

    log('✅ Itlasuhua Brain cargado');

})(window);