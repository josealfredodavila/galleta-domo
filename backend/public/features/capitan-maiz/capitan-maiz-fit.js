// ================================================================
// CAPITÁN MAÍZ · FIT v2.0
// ================================================================
// Coordenadas maestras del Capitán Maíz.
// Estas coordenadas corresponden al SVG 200 × 300.
//
// DISEÑO:
// - Sombrero galáctico
// - Antenas
// - Cabeza chibi
// - Chaqueta charra
// - Brazos
// - Capa
// - Pantalón
// - Rodilleras
// - Botas
//
// IMPORTANTE:
// Este archivo NO dibuja el personaje.
// Define las zonas donde la tienda/accesorios deben colocarse.
// ================================================================

(function(window) {
    'use strict';

    // ============================================================
    // ZONAS FÍSICAS DEL PERSONAJE
    // ============================================================

    const ZONA = {

        cabeza: {
            x: 100,
            y: 92,
            size: 72
        },

        cara: {
            x: 100,
            y: 110,
            size: 62
        },

        sombrero: {
            x: 100,
            y: 35,
            size: 115
        },

        antenaIzq: {
            x: 72,
            y: 65,
            size: 28
        },

        antenaDer: {
            x: 128,
            y: 65,
            size: 28
        },

        torso: {
            x: 100,
            y: 177,
            size: 82
        },

        pecho: {
            x: 100,
            y: 177,
            size: 72
        },

        brazoIzq: {
            x: 58,
            y: 183,
            size: 52
        },

        brazoDer: {
            x: 142,
            y: 183,
            size: 52
        },

        manoIzq: {
            x: 51,
            y: 222,
            size: 30
        },

        manoDer: {
            x: 149,
            y: 215,
            size: 30
        },

        piernaIzq: {
            x: 82,
            y: 246,
            size: 50
        },

        piernaDer: {
            x: 118,
            y: 246,
            size: 50
        },

        rodillaIzq: {
            x: 82,
            y: 255,
            size: 30
        },

        rodillaDer: {
            x: 118,
            y: 255,
            size: 30
        },

        pies: {
            x: 100,
            y: 286,
            size: 72
        },

        botaIzq: {
            x: 76,
            y: 286,
            size: 42
        },

        botaDer: {
            x: 124,
            y: 286,
            size: 42
        },

        capa: {
            x: 100,
            y: 205,
            size: 150
        }
    };


    // ============================================================
    // CATEGORÍAS DE LA TIENDA
    // ============================================================

    const CATEGORIAS = {

        sombrero: {
            x: 100,
            y: 34,
            size: 118,
            slot: 'sombrero'
        },

        antena: {
            x: 100,
            y: 63,
            size: 38,
            slot: 'cabeza'
        },

        cara: {
            x: 100,
            y: 110,
            size: 68,
            slot: 'cara'
        },

        traje: {
            x: 100,
            y: 178,
            size: 92,
            slot: 'torso'
        },

        camisa: {
            x: 100,
            y: 174,
            size: 68,
            slot: 'pecho'
        },

        capa: {
            x: 100,
            y: 207,
            size: 150,
            slot: 'capa'
        },

        accesorio: {
            x: 150,
            y: 212,
            size: 38,
            slot: 'mano-der'
        },

        accesorio_cabeza: {
            x: 100,
            y: 72,
            size: 42,
            slot: 'cabeza'
        },

        accesorio_torso: {
            x: 100,
            y: 178,
            size: 50,
            slot: 'torso'
        },

        pantalon: {
            x: 100,
            y: 244,
            size: 76,
            slot: 'piernas'
        },

        botas: {
            x: 100,
            y: 284,
            size: 78,
            slot: 'pies'
        },

        rodilleras: {
            x: 100,
            y: 254,
            size: 62,
            slot: 'piernas'
        }
    };


    // ============================================================
    // OBTENER CATEGORÍA
    // ============================================================

    function getCategoria(cat) {

        const c = CATEGORIAS[cat];

        if (!c) {
            return {
                x: 100,
                y: 180,
                size: 60
            };
        }

        return {
            x: c.x,
            y: c.y,
            size: c.size
        };
    }


    // ============================================================
    // OBTENER SLOT
    // ============================================================

    function getSlot(cat) {

        const c = CATEGORIAS[cat];

        return c ? c.slot : 'torso';
    }


    // ============================================================
    // OBTENER ZONA
    // ============================================================

    function getZona(zona) {

        return ZONA[zona] || ZONA.torso;
    }


    // ============================================================
    // API PÚBLICA
    // ============================================================

    window.CapitanMaizFit = {

        getCategoria: getCategoria,

        getSlot: getSlot,

        getZona: getZona,

        _categorias: Object.keys(CATEGORIAS),

        _zonas: Object.keys(ZONA),

        _version: '2.0',

        _viewBox: {
            width: 200,
            height: 300
        }
    };


    console.log(
        '[Capitán Maíz/Fit] ✅ v2.0 cargado · ' +
        Object.keys(CATEGORIAS).length +
        ' categorías · SVG 200×300'
    );

})(window);