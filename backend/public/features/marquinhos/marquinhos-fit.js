// ================================================================
// MARQUINHOS · FIT SYSTEM — v1.2
// ================================================================
// FASE 1 (ajustada)
// - Coordenadas únicas para TIENDA + PET
// - Posiciones afinadas según pruebas visuales
// - NO modifica Supabase
// - NO modifica svg_data
// - Compatible con accesorios actuales basados en emoji
// - Preparado para futura migración a SVG real
//
// VIEWBOX BASE DE MARQUINHOS:
// 200 x 300
// ================================================================

(function (window) {
    'use strict';

    const MQ_FIT = Object.freeze({

        viewBox: Object.freeze({
            x: 0,
            y: 0,
            width: 200,
            height: 300
        }),

        zonas: Object.freeze({

            cabeza: Object.freeze({
                x: 35,
                y: 40,
                width: 130,
                height: 120
            }),

            cara: Object.freeze({
                x: 50,
                y: 76,
                width: 100,
                height: 72
            }),

            cuello: Object.freeze({
                x: 88,
                y: 158,
                width: 24,
                height: 12
            }),

            torso: Object.freeze({
                x: 60,
                y: 165,
                width: 80,
                height: 85
            }),

            brazos: Object.freeze({
                x: 30,
                y: 180,
                width: 140,
                height: 48
            }),

            piernas: Object.freeze({
                x: 77,
                y: 250,
                width: 46,
                height: 28
            }),

            pies: Object.freeze({
                x: 70,
                y: 278,
                width: 60,
                height: 12
            })

        }),

        // ============================================================
        // POSICIONES COMPATIBLES CON LOS EMOJIS ACTUALES
        // v1.2 — Ajustadas tras pruebas visuales
        // ============================================================

        categorias: Object.freeze({

            sombrero: Object.freeze({
                x: 100,
                y: 62,
                size: 78,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'head'
            }),

            lentes: Object.freeze({
                x: 100,
                y: 110,
                size: 72,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'face'
            }),

            playera: Object.freeze({
                x: 100,
                y: 205,
                size: 78,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'torso'
            }),

            pantalon: Object.freeze({
                x: 100,
                y: 250,
                size: 72,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'legs'
            }),

            zapatos: Object.freeze({
                x: 100,
                y: 284,
                size: 68,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'feet'
            }),

            accesorio: Object.freeze({
                x: 178,
                y: 200,
                size: 35,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                layer: 'front'
            })

        }),

        layers: Object.freeze({
            back: 10,
            legs: 20,
            torso: 30,
            arms: 40,
            feet: 50,
            face: 60,
            head: 70,
            front: 80
        }),

        getCategoria: function (categoria) {
            const cat = String(categoria || '')
                .trim()
                .toLowerCase();

            return this.categorias[cat]
                || Object.freeze({
                    x: 100,
                    y: 100,
                    size: 55,
                    scaleX: 1,
                    scaleY: 1,
                    rotation: 0,
                    layer: 'front'
                });
        },

        getZona: function (categoria) {
            const cat = String(categoria || '')
                .trim()
                .toLowerCase();

            const mapa = {
                sombrero: 'cabeza',
                lentes: 'cara',
                playera: 'torso',
                pantalon: 'piernas',
                zapatos: 'pies',
                accesorio: 'torso'
            };

            return this.zonas[mapa[cat] || 'torso'];
        },

        getLayer: function (categoria) {
            const posicion = this.getCategoria(categoria);
            return this.layers[posicion.layer] || this.layers.front;
        }

    });

    window.MarquinhosFit = MQ_FIT;

})(window);