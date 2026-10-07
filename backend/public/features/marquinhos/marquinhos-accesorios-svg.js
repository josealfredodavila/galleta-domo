// ================================================================
// MARQUINHOS · ACCESORIOS SVG REALES — v1.0
// ================================================================
// Biblioteca de SVG reales para cada accesorio.
// Los SVG están diseñados para el viewBox 0 0 200 300.
//
// CÓMO FUNCIONA:
// - Cada clave es el emoji que estaba en la BD (ej: '📿').
// - El valor es el SVG real que lo reemplaza.
// - El código de la tienda y del pet detecta automáticamente
//   si svg_data es un emoji o un SVG real.
//
// FASE 1: Solo los 3 accesorios más problemáticos.
// ================================================================

(function (window) {
    'use strict';

    const SVG_ACCESORIOS = {

        // ============================================================
        // 📿 COLLAR DE ORO
        // ============================================================
        // Se dibuja como una joya corta sobre el cuello/torso alto.
        // ============================================================
        '📿': `
            <g>
                <!-- Cadena del collar -->
                <path d="M 72 175 Q 100 195 128 175" 
                      fill="none" 
                      stroke="#D4AF37" 
                      stroke-width="3"
                      stroke-linecap="round"/>
                <!-- Colgante central -->
                <circle cx="100" cy="190" r="5" 
                        fill="#FFD700" 
                        stroke="#B8860B" 
                        stroke-width="1"/>
                <!-- Brillo del colgante -->
                <circle cx="99" cy="188" r="1.5" 
                        fill="#FFFFFF" 
                        opacity="0.9"/>
            </g>
        `,

        // ============================================================
        // 👕 PLAYERA BÁSICA
        // ============================================================
        // Sigue el contorno del torso (cápsula).
        // ============================================================
        '👕': `
            <g>
                <!-- Cuerpo de la playera -->
                <path d="M 68 172 
                         Q 65 175 65 185 
                         L 65 245 
                         Q 65 252 72 252 
                         L 128 252 
                         Q 135 252 135 245 
                         L 135 185 
                         Q 135 175 132 172 
                         Z" 
                      fill="#5BB8E0" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Cuello redondo -->
                <ellipse cx="100" cy="175" rx="18" ry="7" 
                         fill="#0D47A1" 
                         opacity="0.5"/>
                <!-- Brillo superior -->
                <ellipse cx="88" cy="200" rx="12" ry="18" 
                         fill="#FFFFFF" 
                         opacity="0.2"/>
            </g>
        `,

        // ============================================================
        // 🩳 SHORTS DE VERANO
        // ============================================================
        // Sigue el contorno de las piernas.
        // ============================================================
        '🩳': `
            <g>
                <!-- Cuerpo del short -->
                <path d="M 68 245 
                         L 68 268 
                         Q 68 273 73 273 
                         L 92 273 
                         L 100 258 
                         L 108 273 
                         L 127 273 
                         Q 132 273 132 268 
                         L 132 245 
                         Z" 
                      fill="#3D8FCC" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Cordón de la cintura -->
                <path d="M 92 248 Q 100 255 108 248" 
                      fill="none" 
                      stroke="#FFFFFF" 
                      stroke-width="2"/>
                <!-- Círculos decorativos -->
                <circle cx="80" cy="255" r="2" 
                        fill="#FFFFFF" 
                        opacity="0.6"/>
                <circle cx="120" cy="255" r="2" 
                        fill="#FFFFFF" 
                        opacity="0.6"/>
            </g>
        `,

        // ============================================================
        // 👖 PANTALÓN CASUAL
        // ============================================================
        // Pantalón largo, llega hasta las rodillas.
        // ============================================================
        '👖': `
            <g>
                <!-- Pierna izquierda -->
                <path d="M 72 245 L 72 285 Q 72 288 75 288 L 90 288 Q 92 288 92 285 L 95 250 Z" 
                      fill="#3D5A99" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Pierna derecha -->
                <path d="M 128 245 L 128 285 Q 128 288 125 288 L 110 288 Q 108 288 108 285 L 105 250 Z" 
                      fill="#3D5A99" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Cintura -->
                <rect x="72" y="245" width="56" height="8" 
                      fill="#2B4370" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <!-- Botón central -->
                <circle cx="100" cy="249" r="2" 
                        fill="#D4AF37"/>
            </g>
        `,

        // ============================================================
        // 👔 TRAJE FORMAL
        // ============================================================
        // Camisa + corbata.
        // ============================================================
        '👔': `
            <g>
                <!-- Cuerpo del traje -->
                <path d="M 68 172 
                         Q 65 175 65 185 
                         L 65 245 
                         Q 65 252 72 252 
                         L 128 252 
                         Q 135 252 135 245 
                         L 135 185 
                         Q 135 175 132 172 
                         Z" 
                      fill="#2C3E50" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Camisa blanca (triángulo) -->
                <path d="M 85 172 L 100 210 L 115 172 Z" 
                      fill="#FFFFFF" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <!-- Corbata -->
                <path d="M 97 195 L 103 195 L 105 215 L 100 220 L 95 215 Z" 
                      fill="#8B0000" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <!-- Nudo de la corbata -->
                <rect x="97" y="190" width="6" height="6" 
                      fill="#A00000"/>
            </g>
        `,

        // ============================================================
        // 🧥 CHAQUETA DE CUERO
        // ============================================================
        '🧥': `
            <g>
                <!-- Cuerpo de la chaqueta -->
                <path d="M 65 172 
                         Q 62 175 62 185 
                         L 62 248 
                         Q 62 255 70 255 
                         L 130 255 
                         Q 138 255 138 248 
                         L 138 185 
                         Q 138 175 135 172 
                         Z" 
                      fill="#5D4037" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
                <!-- Cremallera central -->
                <line x1="100" y1="175" x2="100" y2="250" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
                <!-- Cuello alto -->
                <path d="M 82 172 L 100 180 L 118 172" 
                      fill="none" 
                      stroke="#3E2723" 
                      stroke-width="2.5"/>
            </g>
        `,

        // ============================================================
        // 👗 FALDA
        // ============================================================
        '👗': `
            <g>
                <!-- Falda acampanada -->
                <path d="M 68 240 
                         L 60 285 
                         Q 60 290 65 290 
                         L 135 290 
                         Q 140 290 140 285 
                         L 132 240 
                         Z" 
                      fill="#4A90D9" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <!-- Cintura -->
                <rect x="68" y="238" width="64" height="6" 
                      fill="#2B4370" 
                      stroke="#0D47A1" 
                      stroke-width="1"/>
            </g>
        `

    };

    // ============================================================
    // API PÚBLICA
    // ============================================================

    window.MarquinhosAccesoriosSVG = {

        // Devuelve el SVG real para un emoji, o null si no existe
        get: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return null;
            return SVG_ACCESORIOS[svgData.trim()] || null;
        },

        // Devuelve true si el accesorio ya está migrado a SVG
        esSVG: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return false;
            const t = svgData.trim();
            return t.indexOf('<') === 0;
        },

        // Devuelve el SVG a renderizar (sea SVG real o emoji convertido)
        render: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return null;
            const t = svgData.trim();

            // Si ya es SVG real (empieza con <), lo devuelve tal cual
            if (t.indexOf('<') === 0) return t;

            // Si es emoji, busca el SVG equivalente
            return SVG_ACCESORIOS[t] || null;
        },

        // Lista de emojis disponibles para migrar
        _disponibles: function () {
            return Object.keys(SVG_ACCESORIOS);
        }

    };

    console.log('[Marquinhos/AccesoriosSVG] ✅ Biblioteca cargada · ' + 
                Object.keys(SVG_ACCESORIOS).length + ' SVG disponibles');

})(window);