// ================================================================
// MARQUINHOS · ACCESORIOS SVG REALES — v1.1
// ================================================================
// Biblioteca de SVG reales para cada accesorio.
// Los SVG están diseñados para el viewBox 0 0 200 300.
//
// CAMBIOS v1.1:
// - Sombrero vaquero: ala más ancha y visible por encima de la cabeza
// - Traje formal: colores oscuros elegantes (negro/azul con corbata roja)
// ================================================================

(function (window) {
    'use strict';

    const SVG_ACCESORIOS = {

        // ============================================================
        // 📿 COLLAR DE ORO
        // ============================================================
        '📿': `
            <g>
                <path d="M 72 175 Q 100 195 128 175" 
                      fill="none" 
                      stroke="#D4AF37" 
                      stroke-width="3"
                      stroke-linecap="round"/>
                <circle cx="100" cy="190" r="5" 
                        fill="#FFD700" 
                        stroke="#B8860B" 
                        stroke-width="1"/>
                <circle cx="99" cy="188" r="1.5" 
                        fill="#FFFFFF" 
                        opacity="0.9"/>
            </g>
        `,

        // ============================================================
        // 👕 PLAYERA BÁSICA
        // ============================================================
        '👕': `
            <g>
                <path d="M 68 172 Q 65 175 65 185 L 65 245 Q 65 252 72 252 L 128 252 Q 135 252 135 245 L 135 185 Q 135 175 132 172 Z" 
                      fill="#5BB8E0" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <ellipse cx="100" cy="175" rx="18" ry="7" 
                         fill="#0D47A1" 
                         opacity="0.5"/>
                <ellipse cx="88" cy="200" rx="12" ry="18" 
                         fill="#FFFFFF" 
                         opacity="0.2"/>
            </g>
        `,

        // ============================================================
        // 🩳 SHORTS DE VERANO
        // ============================================================
        '🩳': `
            <g>
                <path d="M 68 245 L 68 268 Q 68 273 73 273 L 92 273 L 100 258 L 108 273 L 127 273 Q 132 273 132 268 L 132 245 Z" 
                      fill="#3D8FCC" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <path d="M 92 248 Q 100 255 108 248" 
                      fill="none" 
                      stroke="#FFFFFF" 
                      stroke-width="2"/>
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
        '👖': `
            <g>
                <path d="M 72 245 L 72 285 Q 72 288 75 288 L 90 288 Q 92 288 92 285 L 95 250 Z" 
                      fill="#3D5A99" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <path d="M 128 245 L 128 285 Q 128 288 125 288 L 110 288 Q 108 288 108 285 L 105 250 Z" 
                      fill="#3D5A99" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <rect x="72" y="245" width="56" height="8" 
                      fill="#2B4370" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <circle cx="100" cy="249" r="2" 
                        fill="#D4AF37"/>
            </g>
        `,

        // ============================================================
        // 👔 TRAJE FORMAL (v1.1 — colores oscuros elegantes)
        // ============================================================
        '👔': `
            <g>
                <!-- Cuerpo del traje (azul marino oscuro) -->
                <path d="M 68 172 Q 65 175 65 185 L 65 245 Q 65 252 72 252 L 128 252 Q 135 252 135 245 L 135 185 Q 135 175 132 172 Z" 
                      fill="#1A237E" 
                      stroke="#0D1B4D" 
                      stroke-width="2"/>
                
                <!-- Solapas del saco -->
                <path d="M 72 175 L 88 190 L 100 185 L 112 190 L 128 175 L 128 195 L 72 195 Z" 
                      fill="#283593" 
                      stroke="#0D1B4D" 
                      stroke-width="1.5"/>
                
                <!-- Camisa blanca (triángulo) -->
                <path d="M 88 175 L 100 210 L 112 175 Z" 
                      fill="#FFFFFF" 
                      stroke="#0D1B4D" 
                      stroke-width="1.5"/>
                
                <!-- Nudo de la corbata -->
                <path d="M 97 178 L 103 178 L 104 188 L 96 188 Z" 
                      fill="#B71C1C" 
                      stroke="#7F0000" 
                      stroke-width="1"/>
                
                <!-- Cuerpo de la corbata -->
                <path d="M 97 188 L 103 188 L 105 220 L 100 226 L 95 220 Z" 
                      fill="#D32F2F" 
                      stroke="#7F0000" 
                      stroke-width="1"/>
                
                <!-- Botones del saco -->
                <circle cx="90" cy="210" r="1.5" fill="#D4AF37"/>
                <circle cx="90" cy="225" r="1.5" fill="#D4AF37"/>
            </g>
        `,

        // ============================================================
        // 🧥 CHAQUETA DE CUERO
        // ============================================================
        '🧥': `
            <g>
                <path d="M 65 172 Q 62 175 62 185 L 62 248 Q 62 255 70 255 L 130 255 Q 138 255 138 248 L 138 185 Q 138 175 135 172 Z" 
                      fill="#5D4037" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
                <line x1="100" y1="175" x2="100" y2="250" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
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
                <path d="M 68 240 L 60 285 Q 60 290 65 290 L 135 290 Q 140 290 140 285 L 132 240 Z" 
                      fill="#4A90D9" 
                      stroke="#0D47A1" 
                      stroke-width="2"/>
                <rect x="68" y="238" width="64" height="6" 
                      fill="#2B4370" 
                      stroke="#0D47A1" 
                      stroke-width="1"/>
            </g>
        `,

        // ============================================================
        // 👟 TENIS DEPORTIVOS
        // ============================================================
        '👟': `
            <g>
                <path d="M 70 280 Q 70 288 78 288 L 92 288 Q 96 288 96 285 L 96 280 Z" 
                      fill="#4A90D9" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <path d="M 104 280 Q 104 288 112 288 L 126 288 Q 130 288 130 285 L 130 280 Z" 
                      fill="#4A90D9" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
            </g>
        `,

        // ============================================================
        // 🥾 BOTAS
        // ============================================================
        '🥾': `
            <g>
                <path d="M 70 278 L 70 288 Q 70 292 74 292 L 94 292 Q 96 292 96 290 L 96 278 Z" 
                      fill="#8B4513" 
                      stroke="#3E2723" 
                      stroke-width="1.5"/>
                <path d="M 104 278 L 104 288 Q 104 292 108 292 L 128 292 Q 130 292 130 290 L 130 278 Z" 
                      fill="#8B4513" 
                      stroke="#3E2723" 
                      stroke-width="1.5"/>
            </g>
        `,

        // ============================================================
        // 👞 ZAPATOS FORMALES
        // ============================================================
        '👞': `
            <g>
                <path d="M 68 280 L 68 288 Q 68 291 72 291 L 94 291 Q 96 291 96 288 L 96 280 Z" 
                      fill="#6D4C41" 
                      stroke="#3E2723" 
                      stroke-width="1.5"/>
                <path d="M 104 280 L 104 288 Q 104 291 108 291 L 130 291 Q 132 291 132 288 L 132 280 Z" 
                      fill="#6D4C41" 
                      stroke="#3E2723" 
                      stroke-width="1.5"/>
            </g>
        `,

        // ============================================================
        // 🩴 SANDALIAS
        // ============================================================
        '🩴': `
            <g>
                <path d="M 70 282 L 70 288 Q 70 291 74 291 L 92 291 Q 94 291 94 288 L 94 282 Z" 
                      fill="#26C6DA" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <path d="M 106 282 L 106 288 Q 106 291 110 291 L 128 291 Q 130 291 130 288 L 130 282 Z" 
                      fill="#26C6DA" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <line x1="78" y1="284" x2="84" y2="288" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <line x1="116" y1="284" x2="122" y2="288" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
            </g>
        `,

        // ============================================================
        // 🎩 SOMBRERO CHARRO
        // ============================================================
        '🎩': `
            <g>
                <path d="M 70 55 L 70 40 Q 70 38 75 38 L 125 38 Q 130 38 130 40 L 130 55 Z" 
                      fill="#212121" 
                      stroke="#000" 
                      stroke-width="1.5"/>
                <ellipse cx="100" cy="55" rx="34" ry="4" 
                         fill="#212121" 
                         stroke="#000" 
                         stroke-width="1.5"/>
                <rect x="70" y="48" width="60" height="5" 
                      fill="#D32F2F"/>
            </g>
        `,

        // ============================================================
        // 🤠 SOMBRERO VAQUERO (v1.1 — ala ancha visible)
        // ============================================================
        '🤠': `
            <g>
                <!-- Copa del sombrero (arriba, más alta) -->
                <path d="M 78 40 L 78 25 Q 78 22 82 22 L 118 22 Q 122 22 122 25 L 122 40 Z" 
                      fill="#8D6E63" 
                      stroke="#4E342E" 
                      stroke-width="1.5"/>
                
                <!-- Banda decorativa -->
                <rect x="78" y="36" width="44" height="4" 
                      fill="#4E342E"/>
                <circle cx="100" cy="38" r="2" 
                        fill="#D4AF37"/>
                
                <!-- Ala ancha del sombrero (por encima de la cabeza) -->
                <ellipse cx="100" cy="42" rx="42" ry="7" 
                         fill="#A1887F" 
                         stroke="#4E342E" 
                         stroke-width="1.5"/>
                
                <!-- Sombra debajo del ala -->
                <ellipse cx="100" cy="46" rx="36" ry="3" 
                         fill="#4E342E" 
                         opacity="0.4"/>
            </g>
        `,

        // ============================================================
        // 🧢 GORRA DEPORTIVA
        // ============================================================
        '🧢': `
            <g>
                <path d="M 70 62 Q 70 40 100 40 Q 130 40 130 62 L 130 65 L 70 65 Z" 
                      fill="#42A5F5" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <path d="M 128 62 Q 140 65 140 70 L 128 70 Z" 
                      fill="#1E88E5" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <circle cx="100" cy="45" r="3" 
                        fill="#1E88E5"/>
            </g>
        `,

        // ============================================================
        // 👑 CORONA DORADA
        // ============================================================
        '👑': `
            <g>
                <path d="M 72 55 L 78 32 L 88 45 L 100 25 L 112 45 L 122 32 L 128 55 Z" 
                      fill="#FFD700" 
                      stroke="#B8860B" 
                      stroke-width="1.5"/>
                <rect x="72" y="55" width="56" height="5" 
                      fill="#FFA000" 
                      stroke="#B8860B" 
                      stroke-width="1"/>
                <circle cx="78" cy="35" r="2" 
                        fill="#FF5252"/>
                <circle cx="100" cy="28" r="2" 
                        fill="#2196F3"/>
                <circle cx="122" cy="35" r="2" 
                        fill="#4CAF50"/>
            </g>
        `,

        // ============================================================
        // 👓 LENTES CLÁSICOS
        // ============================================================
        '👓': `
            <g>
                <ellipse cx="72" cy="108" rx="14" ry="11" 
                         fill="none" 
                         stroke="#3E2723" 
                         stroke-width="2.5"/>
                <ellipse cx="128" cy="108" rx="14" ry="11" 
                         fill="none" 
                         stroke="#3E2723" 
                         stroke-width="2.5"/>
                <line x1="86" y1="108" x2="114" y2="108" 
                      stroke="#3E2723" 
                      stroke-width="2.5"/>
                <line x1="58" y1="106" x2="50" y2="102" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
                <line x1="142" y1="106" x2="150" y2="102" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
            </g>
        `,

        // ============================================================
        // 🕶️ LENTES DE SOL
        // ============================================================
        '🕶️': `
            <g>
                <ellipse cx="72" cy="108" rx="16" ry="12" 
                         fill="#212121" 
                         stroke="#000" 
                         stroke-width="2.5"/>
                <ellipse cx="128" cy="108" rx="16" ry="12" 
                         fill="#212121" 
                         stroke="#000" 
                         stroke-width="2.5"/>
                <line x1="88" y1="108" x2="112" y2="108" 
                      stroke="#000" 
                      stroke-width="3"/>
                <line x1="56" y1="106" x2="48" y2="102" 
                      stroke="#000" 
                      stroke-width="2.5"/>
                <line x1="144" y1="106" x2="152" y2="102" 
                      stroke="#000" 
                      stroke-width="2.5"/>
                <ellipse cx="66" cy="103" rx="4" ry="2" 
                         fill="#FFFFFF" 
                         opacity="0.6"/>
                <ellipse cx="122" cy="103" rx="4" ry="2" 
                         fill="#FFFFFF" 
                         opacity="0.6"/>
            </g>
        `,

        // ============================================================
        // 🎒 MOCHILA
        // ============================================================
        '🎒': `
            <g>
                <rect x="168" y="180" width="28" height="38" rx="6" 
                      fill="#E53935" 
                      stroke="#B71C1C" 
                      stroke-width="1.5"/>
                <rect x="174" y="192" width="16" height="8" rx="2" 
                      fill="#B71C1C"/>
                <path d="M 174 180 Q 174 172 182 172 Q 190 172 190 180" 
                      fill="none" 
                      stroke="#B71C1C" 
                      stroke-width="2"/>
                <line x1="182" y1="218" x2="182" y2="225" 
                      stroke="#B71C1C" 
                      stroke-width="2"/>
            </g>
        `,

        // ============================================================
        // ⌚ RELOJ DE LUJO
        // ============================================================
        '⌚': `
            <g>
                <circle cx="182" cy="200" r="12" 
                        fill="#FFFFFF" 
                        stroke="#D4AF37" 
                        stroke-width="2.5"/>
                <line x1="182" y1="200" x2="182" y2="193" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <line x1="182" y1="200" x2="188" y2="200" 
                      stroke="#0D47A1" 
                      stroke-width="1.5"/>
                <path d="M 174 190 L 174 178" 
                      stroke="#8D6E63" 
                      stroke-width="4"/>
                <path d="M 190 190 L 190 178" 
                      stroke="#8D6E63" 
                      stroke-width="4"/>
            </g>
        `,

        // ============================================================
        // ☂️ PARAGUAS
        // ============================================================
        '☂️': `
            <g>
                <path d="M 152 190 Q 160 175 168 190 Q 176 175 184 190 Q 192 175 200 190" 
                      fill="#7C4DFF" 
                      stroke="#4A148C" 
                      stroke-width="1.5"/>
                <line x1="176" y1="190" x2="176" y2="220" 
                      stroke="#3E2723" 
                      stroke-width="2"/>
                <path d="M 176 220 Q 176 226 172 226" 
                      fill="none" 
                      stroke="#3E2723" 
                      stroke-width="2"
                      stroke-linecap="round"/>
            </g>
        `

    };

    // ============================================================
    // API PÚBLICA
    // ============================================================

    window.MarquinhosAccesoriosSVG = {

        get: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return null;
            return SVG_ACCESORIOS[svgData.trim()] || null;
        },

        esSVG: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return false;
            const t = svgData.trim();
            return t.indexOf('<') === 0;
        },

        render: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return null;
            const t = svgData.trim();

            if (t.indexOf('<') === 0) return t;

            return SVG_ACCESORIOS[t] || null;
        },

        _disponibles: function () {
            return Object.keys(SVG_ACCESORIOS);
        }

    };

    console.log('[Marquinhos/AccesoriosSVG] ✅ v1.1 cargada · ' + 
                Object.keys(SVG_ACCESORIOS).length + ' SVG disponibles');

})(window);