// ================================================================
// ITLASUHUA · BRAIN v4.0
// ================================================================
// Controla al Rey Itlasuhua al hablar:
// - Boca abierta
// - Alas batiendo
// - Polvo arcoíris
// ================================================================

(function (window) {
    'use strict';

    if (window.__itlasuhuaBrainLoaded) return;
    window.__itlasuhuaBrainLoaded = true;

    function log(msg) {
        console.log('[Itlasuhua/Brain]', msg);
    }

    let spitTimer = null;

    // ============================================================
    // ALAS
    // ============================================================

    function setWings(talking) {

        const izq =
            document.querySelector(
                '#itlasuhua-svg #ala-izq animateTransform'
            );

        const der =
            document.querySelector(
                '#itlasuhua-svg #ala-der animateTransform'
            );

        if (izq) {

            izq.setAttribute(
                'values',
                talking
                    ? '0 125 130; -12 125 130; 8 125 130; 0 125 130'
                    : '0 125 130; -4 125 130; 4 125 130; 0 125 130'
            );

            izq.setAttribute(
                'dur',
                talking
                    ? '0.8s'
                    : '2.6s'
            );
        }

        if (der) {

            der.setAttribute(
                'values',
                talking
                    ? '0 175 130; 12 175 130; -8 175 130; 0 175 130'
                    : '0 175 130; 4 175 130; -4 175 130; 0 175 130'
            );

            der.setAttribute(
                'dur',
                talking
                    ? '0.8s'
                    : '2.6s'
            );
        }
    }

    // ============================================================
    // CLASES
    // ============================================================

    function setClasses(talking) {

        const container =
            document.getElementById(
                'itlasuhua-container'
            );

        const svg =
            document.getElementById(
                'itlasuhua-svg'
            );

        if (container) {
            container.classList.toggle(
                'is-talking',
                talking
            );
        }

        if (svg) {
            svg.classList.toggle(
                'is-talking',
                talking
            );
        }
    }

    // ============================================================
    // BRAIN
    // ============================================================

    const ItlasuhuaBrain = {

        isTalking: false,

        startTalking() {

            if (this.isTalking) return;

            this.isTalking = true;

            setClasses(true);
            setWings(true);

            if (
                window.ItlasuhuaPet &&
                window.ItlasuhuaPet.spit
            ) {

                window.ItlasuhuaPet.spit(
                    8,
                    1
                );

                clearInterval(
                    spitTimer
                );

                spitTimer =
                    setInterval(
                        function () {

                            window.ItlasuhuaPet.spit(
                                3,
                                0.8
                            );

                        },
                        260
                    );
            }

            log(
                'Hablando: boca, alas y polvo activados.'
            );
        },

        stopTalking() {

            this.isTalking = false;

            clearInterval(
                spitTimer
            );

            spitTimer = null;

            setClasses(false);
            setWings(false);

            log(
                'En reposo.'
            );
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

    window.ItlasuhuaBrain =
        ItlasuhuaBrain;

    log(
        '✅ Itlasuhua Brain v4.0 cargado'
    );

})(window);