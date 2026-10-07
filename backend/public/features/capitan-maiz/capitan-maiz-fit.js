// ================================================================
// CAPITÁN MAÍZ · FIT v1.0
// Coordenadas compartidas entre el pet y la tienda (si aplica)
// Estilo: Chibi Kawaii Galáctico + Neon Charro
// ================================================================

(function(window) {
    'use strict';

    // Zona de encuadre del personaje
    // Ajustar cuando Anthropic entregue el SVG definitivo
    const ZONA = {
        cabeza:  { x: 100, y: 60,  size: 90 },
        cara:    { x: 100, y: 110, size: 70 },
        torso:   { x: 100, y: 200, size: 100 },
        brazoIzq:  { x: 40,  y: 200, size: 60 },
        brazoDer:  { x: 160, y: 200, size: 60 },
        piernaIzq: { x: 80,  y: 260, size: 60 },
        piernaDer: { x: 120, y: 260, size: 60 },
        pies:    { x: 100, y: 290, size: 70 }
    };

    // Mapeo de categorías → coordenadas
    const CATEGORIAS = {
        sombrero:  { x: 100, y: 30,  size: 110, slot: 'cabeza' },
        cara:      { x: 100, y: 110, size: 70,  slot: 'cara' },
        traje:     { x: 100, y: 200, size: 100, slot: 'torso' },
        capa:      { x: 100, y: 220, size: 130, slot: 'fondo' },
        botas:     { x: 100, y: 290, size: 80,  slot: 'pies' },
        accesorio: { x: 180, y: 200, size: 50,  slot: 'mano-der' }
    };

    function getCategoria(cat) {
        const c = CATEGORIAS[cat];
        if (!c) return { x: 100, y: 200, size: 60 };
        return { x: c.x, y: c.y, size: c.size };
    }

    function getSlot(cat) {
        const c = CATEGORIAS[cat];
        return c ? c.slot : 'torso';
    }

    function getZona(zona) {
        return ZONA[zona] || ZONA.torso;
    }

    window.CapitanMaizFit = {
        getCategoria: getCategoria,
        getSlot: getSlot,
        getZona: getZona,
        _categorias: Object.keys(CATEGORIAS),
        _zonas: Object.keys(ZONA)
    };

    console.log('[Capitán Maíz/Fit] ✅ v1.0 cargado · ' + Object.keys(CATEGORIAS).length + ' categorías');
})(window);