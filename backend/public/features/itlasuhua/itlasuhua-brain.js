// ================================================================
// ITLASUHUA · BRAIN
// ================================================================
// Cerebro y comportamiento del Rey Itlasuhua.
// Controla las alas al hablar.
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaBrainLoaded) return;
    window.__itlasuhuaBrainLoaded = true;

    function log(msg) {
        console.log('[Itlasuhua/Brain]', msg);
    }

    const ItlasuhuaBrain = {

        isTalking: false,

        startTalking() {
            this.isTalking = true;

            const alas = document.querySelectorAll(
                '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
            );

            alas.forEach((ala) => {
                const animation = ala.querySelector('animateTransform');
                if (!animation) return;

                if (ala.id === 'ala-izq') {
                    animation.setAttribute('values', '0 222 300; -10 222 300; 0 222 300');
                } else {
                    animation.setAttribute('values', '0 378 300; 10 378 300; 0 378 300');
                }

                animation.setAttribute('dur', '0.65s');
            });

            log('Las alas se despliegan al hablar.');
        },

        stopTalking() {
            this.isTalking = false;

            const alas = document.querySelectorAll(
                '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
            );

            alas.forEach((ala) => {
                const animation = ala.querySelector('animateTransform');
                if (!animation) return;

                if (ala.id === 'ala-izq') {
                    animation.setAttribute('values', '0 222 300; -4 222 300; 0 222 300');
                } else {
                    animation.setAttribute('values', '0 378 300; 4 378 300; 0 378 300');
                }

                animation.setAttribute('dur', '2.4s');
            });

            log('Alas en reposo.');
        },

        toggleTalking() {
            if (this.isTalking) {
                this.stopTalking();
            } else {
                this.startTalking();
            }
        },

        reset() {
            this.isTalking = false;

            const alas = document.querySelectorAll(
                '#itlasuhua-svg #ala-izq, #itlasuhua-svg #ala-der'
            );

            alas.forEach((ala) => {
                const animation = ala.querySelector('animateTransform');
                if (!animation) return;

                if (ala.id === 'ala-izq') {
                    animation.setAttribute('values', '0 222 300; -4 222 300; 0 222 300');
                } else {
                    animation.setAttribute('values', '0 378 300; 4 378 300; 0 378 300');
                }

                animation.setAttribute('dur', '2.4s');
            });
        }
    };

    window.ItlasuhuaBrain = ItlasuhuaBrain;

    log('✅ Itlasuhua Brain cargado');

})(window);