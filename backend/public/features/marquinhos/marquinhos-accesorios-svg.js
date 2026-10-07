// ================================================================
// MARQUINHOS · ACCESORIOS SVG — v2.0 "Ajuste perfecto"
// ================================================================
// Cada prenda se dibuja POR PARTES y cada parte se pone dentro de la
// pieza del cuerpo que la lleva. Así la ropa se mueve con Marquinhos:
//   · sombrero y lentes  -> siguen a la cabeza (y a la antena)
//   · mangas             -> siguen al brazo / antebrazo
//   · pantalón y zapatos -> siguen a cada pierna
//   · playera/saco       -> siguen al torso
//
// Las coordenadas son las del cuerpo de Marquinhos (viewBox 200 x 260):
//   cabeza x35-165 y40-160 · torso x60-140 y165-250
//   hombros (60,180)/(140,180) · codos (30,205)/(170,205)
//   muñecas (18,228)/(182,228) · piernas x82 / x118, y250-278
//   botas y278-290
//
// Los mismos nombres (emoji) que ya guardas en svg_data siguen valiendo.
// ================================================================

(function (window) {
    'use strict';

    // Espejo: dibuja una vez el lado izquierdo y se refleja al derecho
    var E = function (s) {
        return '<g transform="translate(200 0) scale(-1 1)">' + s + '</g>';
    };

    var SLOTS = [
        'fondo', 'torso', 'cara', 'cabeza',
        'brazo-izq', 'brazo-der', 'codo-izq', 'codo-der',
        'antebrazo-izq', 'antebrazo-der', 'mano-izq', 'mano-der',
        'pierna-izq', 'pierna-der', 'pie-izq', 'pie-der',
        'cuerpo-frente'
    ];

    // ------------------------------------------------------------
    // DEGRADADOS (se inyectan una sola vez en el SVG)
    // ------------------------------------------------------------
    function grad(id, a, b, c) {
        var stops = c
            ? '<stop offset="0%" stop-color="' + a + '"/><stop offset="55%" stop-color="' + b + '"/><stop offset="100%" stop-color="' + c + '"/>'
            : '<stop offset="0%" stop-color="' + a + '"/><stop offset="100%" stop-color="' + b + '"/>';
        return '<linearGradient id="ga-' + id + '" x1="0%" y1="0%" x2="0%" y2="100%">' + stops + '</linearGradient>';
    }

    var DEFS =
        grad('playera', '#7BD6FF', '#2E94E8') +
        grad('denim', '#5A82C8', '#2E4A8C') +
        grad('shorts', '#4FCBE0', '#1E88B8') +
        grad('falda', '#9C7BFF', '#5B3AD6') +
        grad('traje', '#35479F', '#121A4F') +
        grad('cuero', '#9C6840', '#4A2A16') +
        grad('dorado', '#FFF2A8', '#E8C040', '#A8801A') +
        grad('cowboy', '#CFA478', '#8A6040') +
        grad('ala', '#DDBB92', '#A9835C') +
        grad('gorra', '#66CFFF', '#1565C0') +
        grad('rojo', '#FF7B7B', '#C62828') +
        grad('copa', '#505050', '#101010') +
        grad('paraguas', '#B08BFF', '#5A2FC8') +
        grad('tenis', '#66CFFF', '#1E78D8') +
        grad('bota', '#B98250', '#5E3A1C') +
        grad('formal', '#74503E', '#26120A') +
        grad('sandalia', '#66E6F2', '#0E8AA0') +
        grad('lente', '#2c2c2c', '#000000');

    // ------------------------------------------------------------
    // PIEZAS REUTILIZABLES
    // ------------------------------------------------------------
    // Manga corta (brazo izquierdo): cubre el brazo superior
    function mangaCorta(color, borde, hem) {
        return '<line x1="60" y1="180" x2="42" y2="195" stroke="' + borde + '" stroke-width="17.5" stroke-linecap="round"/>' +
               '<line x1="60" y1="180" x2="42" y2="195" stroke="' + color + '" stroke-width="14" stroke-linecap="round"/>' +
               '<line x1="55" y1="176" x2="46" y2="184" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.28"/>' +
               '<line x1="36.9" y1="188.9" x2="47.1" y2="201.1" stroke="' + hem + '" stroke-width="2.6" stroke-linecap="round"/>';
    }

    // Manga larga: brazo superior + codo + antebrazo
    function mangaLargaBrazo(color, borde) {
        return '<line x1="60" y1="180" x2="30" y2="205" stroke="' + borde + '" stroke-width="17.5" stroke-linecap="round"/>' +
               '<line x1="60" y1="180" x2="30" y2="205" stroke="' + color + '" stroke-width="14" stroke-linecap="round"/>' +
               '<line x1="55" y1="177" x2="38" y2="191" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.22"/>';
    }
    function mangaLargaCodo(color, borde, detalle) {
        return '<circle cx="30" cy="205" r="7.4" fill="' + color + '" stroke="' + borde + '" stroke-width="1.6"/>' +
               (detalle || '');
    }
    function mangaLargaAntebrazo(color, borde, puño, puñoBorde) {
        return '<line x1="30" y1="205" x2="19.4" y2="225" stroke="' + borde + '" stroke-width="15.5" stroke-linecap="round"/>' +
               '<line x1="30" y1="205" x2="19.4" y2="225" stroke="' + color + '" stroke-width="12.5" stroke-linecap="round"/>' +
               '<line x1="19.6" y1="224.4" x2="18.7" y2="226.1" stroke="' + puñoBorde + '" stroke-width="13.2" stroke-linecap="round"/>' +
               '<line x1="19.6" y1="224.4" x2="18.7" y2="226.1" stroke="' + puño + '" stroke-width="11" stroke-linecap="round"/>';
    }

    // Pantalón: cintura sobre el torso + pierna izquierda
    var CINTURA = 'M 59 232 L 141 232 L 141 238 Q 141 251 127 251 L 73 251 Q 59 251 59 238 Z';

    // ------------------------------------------------------------
    // CATÁLOGO
    // ------------------------------------------------------------
    var CAT = {};

    // ===== 👕 PLAYERA BÁSICA =====================================
    CAT['👕'] = {
        capa: 20,
        slots: {
            'torso':
                '<path d="M 58 171 Q 58 164 65 164 L 135 164 Q 142 164 142 171 L 142 238 Q 142 250 130 250 L 70 250 Q 58 250 58 238 Z" fill="url(#ga-playera)" stroke="#0D47A1" stroke-width="2.5" stroke-linejoin="round"/>' +
                '<path d="M 59 243 L 141 243" stroke="#1565C0" stroke-width="1.6" stroke-dasharray="3 2.4" opacity="0.7"/>' +
                '<path d="M 66 174 Q 63 205 67 236" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.25"/>' +
                '<path d="M 124 222 Q 128 228 126 238" stroke="#0D47A1" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.28"/>' +
                '<path d="M 78 226 Q 84 231 80 238" stroke="#0D47A1" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.28"/>' +
                '<path d="M 81 164 Q 100 190 119 164" fill="#A8C4DE" stroke="#0D47A1" stroke-width="2"/>' +
                '<path d="M 80 164.5 Q 100 192 120 164.5" fill="none" stroke="#1F78D0" stroke-width="4.2" stroke-linecap="round"/>' +
                '<path d="M 100 196 L 103.2 203 L 110.8 203.8 L 105 208.8 L 106.8 216.2 L 100 212.3 L 93.2 216.2 L 95 208.8 L 89.2 203.8 L 96.8 203 Z" fill="#FFFFFF" stroke="#0D47A1" stroke-width="1" stroke-linejoin="round"/>',
            'brazo-izq': mangaCorta('#3DA8F0', '#0D47A1', '#1F78D0'),
            'brazo-der': E(mangaCorta('#3DA8F0', '#0D47A1', '#1F78D0'))
        }
    };

    // ===== 👔 TRAJE FORMAL =======================================
    var TRAJE_C = '#26358F', TRAJE_B = '#0A1240';
    CAT['👔'] = {
        capa: 25,
        slots: {
            'torso':
                '<path d="M 57 172 Q 57 163 66 163 L 134 163 Q 143 163 143 172 L 143 240 Q 143 253 130 253 L 70 253 Q 57 253 57 240 Z" fill="url(#ga-traje)" stroke="' + TRAJE_B + '" stroke-width="2.6" stroke-linejoin="round"/>' +
                '<path d="M 64 172 Q 61 205 65 240" stroke="#FFFFFF" stroke-width="4.5" fill="none" stroke-linecap="round" opacity="0.18"/>' +
                '<path d="M 84 162 L 100 220 L 116 162 Z" fill="#FFFFFF" stroke="' + TRAJE_B + '" stroke-width="1.4" stroke-linejoin="round"/>' +
                '<path d="M 84 162 L 100 177 L 116 162 L 113 173 L 100 184 L 87 173 Z" fill="#F4F7FF" stroke="' + TRAJE_B + '" stroke-width="1.2" stroke-linejoin="round"/>' +
                '<path d="M 95.5 178 L 104.5 178 L 103 187 L 97 187 Z" fill="#C62828" stroke="#6E0B0B" stroke-width="1"/>' +
                '<path d="M 97 187 L 103 187 L 107.5 224 L 100 232 L 92.5 224 Z" fill="#D93636" stroke="#6E0B0B" stroke-width="1" stroke-linejoin="round"/>' +
                '<path d="M 96 198 L 104 195 M 95 207 L 105 204 M 94.5 216 L 105.5 213" stroke="#FFFFFF" stroke-width="1.2" opacity="0.5"/>' +
                '<path d="M 86 163 L 72 176 L 82 205 L 95 197 L 100 221" fill="#3A4CB0" stroke="' + TRAJE_B + '" stroke-width="1.6" stroke-linejoin="round"/>' +
                E('<path d="M 86 163 L 72 176 L 82 205 L 95 197 L 100 221" fill="#3A4CB0" stroke="' + TRAJE_B + '" stroke-width="1.6" stroke-linejoin="round"/>') +
                '<path d="M 100 221 L 100 253" stroke="' + TRAJE_B + '" stroke-width="1.8"/>' +
                '<circle cx="94" cy="232" r="2.3" fill="#E8C040" stroke="#8A6A10" stroke-width="0.8"/>' +
                '<circle cx="94" cy="244" r="2.3" fill="#E8C040" stroke="#8A6A10" stroke-width="0.8"/>' +
                '<path d="M 116 198 L 129 198 L 127.5 204 L 117.5 204 Z" fill="#FFFFFF" stroke="' + TRAJE_B + '" stroke-width="1"/>' +
                '<path d="M 114 204 L 130 204" stroke="' + TRAJE_B + '" stroke-width="1.2"/>',
            'brazo-izq': mangaLargaBrazo(TRAJE_C, TRAJE_B),
            'brazo-der': E(mangaLargaBrazo(TRAJE_C, TRAJE_B)),
            'codo-izq': mangaLargaCodo(TRAJE_C, TRAJE_B),
            'codo-der': E(mangaLargaCodo(TRAJE_C, TRAJE_B)),
            'antebrazo-izq': mangaLargaAntebrazo(TRAJE_C, TRAJE_B, '#FFFFFF', '#9AA7C8'),
            'antebrazo-der': E(mangaLargaAntebrazo(TRAJE_C, TRAJE_B, '#FFFFFF', '#9AA7C8'))
        }
    };

    // ===== 🧥 CHAQUETA DE CUERO ==================================
    var CUERO_C = '#74482A', CUERO_B = '#2B170C';
    var CUERO_SOLAPA = '<path d="M 86 163 L 70 170 L 77 194 L 94 180 Z" fill="#8A5A36" stroke="' + CUERO_B + '" stroke-width="1.6" stroke-linejoin="round"/>';
    var CUERO_BOLSILLO = '<path d="M 66 216 L 86 224" stroke="' + CUERO_B + '" stroke-width="1.8" stroke-linecap="round"/><path d="M 66 216 L 86 224" stroke="#C9C9D4" stroke-width="0.9" stroke-dasharray="1.6 1.6" stroke-linecap="round"/>';
    CAT['🧥'] = {
        capa: 25,
        slots: {
            'torso':
                '<path d="M 57 172 Q 57 163 66 163 L 134 163 Q 143 163 143 172 L 143 240 Q 143 253 130 253 L 70 253 Q 57 253 57 240 Z" fill="url(#ga-cuero)" stroke="' + CUERO_B + '" stroke-width="2.6" stroke-linejoin="round"/>' +
                '<path d="M 90 163 L 100 196 L 110 163 Z" fill="#17171C"/>' +
                '<path d="M 64 174 Q 60 206 64 238" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.2"/>' +
                '<path d="M 120 176 Q 128 190 126 206" stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" opacity="0.16"/>' +
                '<path d="M 58 243 L 142 243" stroke="' + CUERO_B + '" stroke-width="2"/>' +
                '<rect x="58" y="243" width="84" height="8" rx="3" fill="#5C3720" opacity="0.9"/>' +
                '<path d="M 100 196 L 100 253" stroke="#D5D5E0" stroke-width="2.4"/>' +
                '<path d="M 100 196 L 100 253" stroke="' + CUERO_B + '" stroke-width="2.4" stroke-dasharray="1.3 1.7"/>' +
                '<circle cx="100" cy="196" r="2.6" fill="#E3E3EE" stroke="' + CUERO_B + '" stroke-width="0.8"/>' +
                CUERO_SOLAPA + E(CUERO_SOLAPA) + CUERO_BOLSILLO + E(CUERO_BOLSILLO) +
                '<circle cx="66" cy="168" r="2.2" fill="#D5D5E0" stroke="' + CUERO_B + '" stroke-width="0.8"/>' +
                '<circle cx="134" cy="168" r="2.2" fill="#D5D5E0" stroke="' + CUERO_B + '" stroke-width="0.8"/>' +
                '<circle cx="68" cy="247" r="1.8" fill="#D5D5E0"/><circle cx="132" cy="247" r="1.8" fill="#D5D5E0"/>',
            'brazo-izq': mangaLargaBrazo(CUERO_C, CUERO_B),
            'brazo-der': E(mangaLargaBrazo(CUERO_C, CUERO_B)),
            'codo-izq': mangaLargaCodo('#5C3720', CUERO_B, '<path d="M 25.5 202 Q 30 198 34.5 202" stroke="#C9C9D4" stroke-width="0.9" fill="none" stroke-dasharray="1.4 1.4"/>'),
            'codo-der': E(mangaLargaCodo('#5C3720', CUERO_B, '<path d="M 25.5 202 Q 30 198 34.5 202" stroke="#C9C9D4" stroke-width="0.9" fill="none" stroke-dasharray="1.4 1.4"/>')),
            'antebrazo-izq': mangaLargaAntebrazo(CUERO_C, CUERO_B, '#4A2A16', CUERO_B),
            'antebrazo-der': E(mangaLargaAntebrazo(CUERO_C, CUERO_B, '#4A2A16', CUERO_B))
        }
    };

    // ===== 👖 PANTALÓN (jeans) ===================================
    function pantalonPierna() {
        return '<rect x="72" y="246" width="20" height="31" rx="5" fill="url(#ga-denim)" stroke="#1B2B5E" stroke-width="2"/>' +
               '<rect x="72.5" y="270" width="19" height="6.5" rx="2.5" fill="#3C5BA0" stroke="#1B2B5E" stroke-width="1.2"/>' +
               '<path d="M 74.5 250 L 74.5 268" stroke="#E8C98A" stroke-width="1" stroke-dasharray="2 1.8" opacity="0.8"/>' +
               '<path d="M 76 263 Q 82 266.5 88 263" stroke="#1B2B5E" stroke-width="1.3" fill="none" opacity="0.5"/>' +
               '<path d="M 75 256 L 77 252" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.2"/>';
    }
    CAT['👖'] = {
        capa: 10,
        slots: {
            'torso':
                '<path d="' + CINTURA + '" fill="url(#ga-denim)" stroke="#1B2B5E" stroke-width="2" stroke-linejoin="round"/>' +
                '<rect x="59" y="232" width="82" height="7" fill="#243A73" stroke="#1B2B5E" stroke-width="1.4"/>' +
                '<rect x="67" y="231" width="3" height="9" rx="1" fill="#1B2B5E"/><rect x="130" y="231" width="3" height="9" rx="1" fill="#1B2B5E"/>' +
                '<rect x="94" y="232.2" width="12" height="6.2" rx="1.5" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="0.9"/>' +
                '<path d="M 100 239 L 100 251" stroke="#1B2B5E" stroke-width="1.4"/>' +
                '<path d="M 64 241 Q 73 247 80 243" stroke="#E8C98A" stroke-width="1" fill="none" stroke-dasharray="2 1.6"/>' +
                '<path d="M 136 241 Q 127 247 120 243" stroke="#E8C98A" stroke-width="1" fill="none" stroke-dasharray="2 1.6"/>',
            'pierna-izq': pantalonPierna(),
            'pierna-der': E(pantalonPierna())
        }
    };

    // ===== 🩳 SHORTS DE VERANO ===================================
    function shortsPierna() {
        return '<rect x="70.5" y="246" width="23" height="17" rx="4" fill="url(#ga-shorts)" stroke="#0D47A1" stroke-width="2"/>' +
               '<rect x="70.5" y="257.5" width="23" height="5.5" rx="2" fill="#FFFFFF" stroke="#0D47A1" stroke-width="1.2"/>' +
               '<circle cx="77" cy="252" r="1.6" fill="#FFFFFF" opacity="0.8"/><circle cx="86" cy="250" r="1.6" fill="#FFFFFF" opacity="0.8"/><circle cx="82" cy="255" r="1.6" fill="#FFFFFF" opacity="0.8"/>';
    }
    CAT['🩳'] = {
        capa: 10,
        slots: {
            'torso':
                '<path d="' + CINTURA + '" fill="url(#ga-shorts)" stroke="#0D47A1" stroke-width="2" stroke-linejoin="round"/>' +
                '<rect x="59" y="232" width="82" height="6.5" fill="#FFFFFF" stroke="#0D47A1" stroke-width="1.3"/>' +
                '<path d="M 100 238 L 100 251" stroke="#0D47A1" stroke-width="1.4"/>' +
                '<path d="M 96 237 Q 91 245 94 252" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
                '<path d="M 104 237 Q 109 245 106 252" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
                '<circle cx="68" cy="245" r="1.8" fill="#FFFFFF" opacity="0.8"/><circle cx="132" cy="245" r="1.8" fill="#FFFFFF" opacity="0.8"/>',
            'pierna-izq': shortsPierna(),
            'pierna-der': E(shortsPierna())
        }
    };

    // ===== 👗 FALDA ==============================================
    CAT['👗'] = {
        capa: 10,
        slots: {
            'torso':
                '<path d="' + CINTURA + '" fill="url(#ga-falda)" stroke="#2E1A8C" stroke-width="2" stroke-linejoin="round"/>',
            'cuerpo-frente':
                '<path d="M 58 237 L 142 237 Q 152 250 157 265 Q 128 273 100 268 Q 72 273 43 265 Q 48 250 58 237 Z" fill="url(#ga-falda)" stroke="#2E1A8C" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<path d="M 76 240 Q 70 254 66 268 M 88 240 Q 85 255 83 270 M 100 240 L 100 270 M 112 240 Q 115 255 117 270 M 124 240 Q 130 254 134 268" stroke="#2E1A8C" stroke-width="1.3" fill="none" opacity="0.35"/>' +
                '<rect x="58" y="235" width="84" height="7" rx="3" fill="#3F23B5" stroke="#2E1A8C" stroke-width="1.4"/>' +
                '<path d="M 100 235 L 94 229 L 94 241 Z M 100 235 L 106 229 L 106 241 Z" fill="#FFD54F" stroke="#B8860B" stroke-width="1" stroke-linejoin="round"/>' +
                '<circle cx="100" cy="235" r="2.6" fill="#FFB300" stroke="#B8860B" stroke-width="0.9"/>' +
                '<circle cx="74" cy="254" r="1.8" fill="#FFFFFF" opacity="0.55"/><circle cx="126" cy="254" r="1.8" fill="#FFFFFF" opacity="0.55"/><circle cx="100" cy="259" r="1.8" fill="#FFFFFF" opacity="0.55"/><circle cx="52" cy="262" r="1.5" fill="#FFFFFF" opacity="0.45"/><circle cx="148" cy="262" r="1.5" fill="#FFFFFF" opacity="0.45"/>'
        }
    };

    // ------------------------------------------------------------
    // ZAPATOS (la parte del pie izquierdo; el derecho es su espejo)
    // ------------------------------------------------------------
    function tenisPie() {
        return '<path d="M 73 272 L 91 272 L 93 281 Q 99 283 98 289 Q 97 294 91 294 L 73 294 Q 67 294 66 289 Q 65 283 71 281 Z" fill="url(#ga-tenis)" stroke="#0D47A1" stroke-width="1.8" stroke-linejoin="round"/>' +
               '<path d="M 65.5 288.5 L 98.5 288.5 Q 98.5 296 91 296 L 73 296 Q 65.5 296 65.5 288.5 Z" fill="#FFFFFF" stroke="#0D47A1" stroke-width="1.5" stroke-linejoin="round"/>' +
               '<path d="M 69 285.5 Q 82 279.5 95 285.5" stroke="#FFFFFF" stroke-width="1.3" fill="none" opacity="0.75"/>' +
               '<rect x="78" y="270" width="8" height="6" rx="2" fill="#E8F4FF" stroke="#0D47A1" stroke-width="1.1"/>' +
               '<path d="M 76.5 277 L 87.5 277 M 76 280 L 88 280 M 75.5 283 L 88.5 283" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/>' +
               '<path d="M 71 291 Q 82 288 93 291" stroke="#0D47A1" stroke-width="1" fill="none" opacity="0.5"/>';
    }
    function botasPie() {
        return '<path d="M 72 264 L 92 264 L 93 281 Q 99 283 98 290 Q 97 295 91 295 L 73 295 Q 67 295 66 290 Q 65 283 71 281 Z" fill="url(#ga-bota)" stroke="#2E1A0C" stroke-width="1.8" stroke-linejoin="round"/>' +
               '<rect x="70.5" y="262" width="23" height="6" rx="2.5" fill="#8A5A2C" stroke="#2E1A0C" stroke-width="1.4"/>' +
               '<path d="M 76 270 L 88 274 M 88 270 L 76 274 M 76 276 L 88 280 M 88 276 L 76 280" stroke="#E53935" stroke-width="1.7" stroke-linecap="round"/>' +
               '<circle cx="75.5" cy="270.5" r="1" fill="#D5D5E0"/><circle cx="88.5" cy="270.5" r="1" fill="#D5D5E0"/><circle cx="75.5" cy="276.5" r="1" fill="#D5D5E0"/><circle cx="88.5" cy="276.5" r="1" fill="#D5D5E0"/>' +
               '<path d="M 68 287 Q 82 281.5 96 287" stroke="#2E1A0C" stroke-width="1.2" fill="none" stroke-dasharray="2 1.6" opacity="0.8"/>' +
               '<path d="M 65.5 289.5 L 98.5 289.5 L 98.5 292 Q 98 297.5 91 297.5 L 73 297.5 Q 66 297.5 65.5 292 Z" fill="#2B1A0E" stroke="#140A05" stroke-width="1.2" stroke-linejoin="round"/>' +
               '<path d="M 74 268 L 74 280" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity="0.18"/>';
    }
    function formalPie() {
        return '<path d="M 72 275 L 92 275 L 93 283 Q 98 285 97 290 Q 96 294 90 294 L 74 294 Q 68 294 67 290 Q 66 285 71 283 Z" fill="url(#ga-formal)" stroke="#140A05" stroke-width="1.8" stroke-linejoin="round"/>' +
               '<path d="M 66.5 291 L 97.5 291 Q 97 295.5 90 295.5 L 74 295.5 Q 67 295.5 66.5 291 Z" fill="#140A05"/>' +
               '<path d="M 77 278 L 87 278 M 76.5 280.5 L 87.5 280.5 M 76 283 L 88 283" stroke="#E8DCCF" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>' +
               '<path d="M 70 286.5 Q 82 282.5 94 286.5" stroke="#140A05" stroke-width="1" fill="none" opacity="0.6"/>' +
               '<ellipse cx="77" cy="289" rx="4.2" ry="1.7" fill="#FFFFFF" opacity="0.35" transform="rotate(-12 77 289)"/>';
    }
    function sandaliaPie() {
        return '<path d="M 68.5 284 Q 68 296 82 296 Q 96 296 95.5 284 Q 95 279 82 279 Q 69 279 68.5 284 Z" fill="url(#ga-sandalia)" stroke="#075E70" stroke-width="1.8" stroke-linejoin="round"/>' +
               '<path d="M 72 285 Q 82 275 92 285" stroke="#0E8AA0" stroke-width="4.4" fill="none" stroke-linecap="round"/>' +
               '<path d="M 72 285 Q 82 275 92 285" stroke="#7FEFFA" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.7"/>' +
               '<path d="M 82 279.5 L 82 289" stroke="#0E8AA0" stroke-width="3.4" stroke-linecap="round"/>' +
               '<circle cx="82" cy="290" r="2.2" fill="#FFD54F" stroke="#B8860B" stroke-width="0.8"/>' +
               '<path d="M 71 292 Q 82 295 93 292" stroke="#FFFFFF" stroke-width="1.2" fill="none" opacity="0.45"/>';
    }
    CAT['👟'] = { capa: 10, slots: { 'pie-izq': tenisPie(), 'pie-der': E(tenisPie()) } };
    CAT['🥾'] = { capa: 10, slots: { 'pie-izq': botasPie(), 'pie-der': E(botasPie()) } };
    CAT['👞'] = { capa: 10, slots: { 'pie-izq': formalPie(), 'pie-der': E(formalPie()) } };
    CAT['🩴'] = { capa: 10, slots: { 'pie-izq': sandaliaPie(), 'pie-der': E(sandaliaPie()) } };

    // ------------------------------------------------------------
    // SOMBREROS (van en la cabeza; la antena queda por encima)
    // ------------------------------------------------------------
    CAT['🎩'] = {
        capa: 10,
        slots: {
            'cabeza':
                '<ellipse cx="100" cy="47" rx="52" ry="9.5" fill="url(#ga-copa)" stroke="#000000" stroke-width="2"/>' +
                '<path d="M 62 46 L 66 19 Q 66 14 72 14 L 128 14 Q 134 14 134 19 L 138 46 Q 100 54 62 46 Z" fill="url(#ga-copa)" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>' +
                '<path d="M 66.5 19 Q 100 26 133.5 19" stroke="#6A6A6A" stroke-width="1.4" fill="none" opacity="0.8"/>' +
                '<path d="M 62.6 37 Q 100 45 137.4 37 L 138 46 Q 100 54 62 46 Z" fill="#C62828" stroke="#6E0B0B" stroke-width="1.4" stroke-linejoin="round"/>' +
                '<rect x="93" y="40" width="14" height="10" rx="1.5" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.1"/>' +
                '<rect x="96.5" y="42.5" width="7" height="5" rx="1" fill="none" stroke="#8A6A10" stroke-width="1"/>' +
                '<path d="M 72 22 L 70 40" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" opacity="0.28"/>'
        }
    };

    CAT['🤠'] = {
        capa: 10,
        slots: {
            'cabeza':
                '<path d="M 12 44 Q 20 59 100 61 Q 180 59 188 44 Q 178 35 160 40 Q 100 47 40 40 Q 22 35 12 44 Z" fill="url(#ga-ala)" stroke="#4E342E" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<path d="M 22 46 Q 100 57 178 46" stroke="#4E342E" stroke-width="1.2" fill="none" stroke-dasharray="3 2.2" opacity="0.55"/>' +
                '<path d="M 54 44 Q 50 25 64 18 Q 82 13 100 22 Q 118 13 136 18 Q 150 25 146 44 Q 100 51 54 44 Z" fill="url(#ga-cowboy)" stroke="#4E342E" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<path d="M 100 22 Q 100 32 100 40" stroke="#4E342E" stroke-width="1.4" fill="none" opacity="0.5"/>' +
                '<path d="M 52.5 36 Q 100 46 147.5 36 L 146.5 44 Q 100 52 53.5 44 Z" fill="#3E2723" stroke="#2A1814" stroke-width="1.2" stroke-linejoin="round"/>' +
                '<rect x="93" y="41" width="14" height="9" rx="2" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.2"/>' +
                '<rect x="96.5" y="43.5" width="7" height="4" rx="1" fill="none" stroke="#8A6A10" stroke-width="1"/>' +
                '<path d="M 70 24 Q 64 32 64 40" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.25"/>'
        }
    };

    CAT['🧢'] = {
        capa: 10,
        slots: {
            'cabeza':
                '<path d="M 42 58 Q 38 27 100 23 Q 162 27 158 58 Q 100 52 42 58 Z" fill="url(#ga-gorra)" stroke="#0D47A1" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<path d="M 100 24 L 100 54 M 72 27 Q 66 42 64 56 M 128 27 Q 134 42 136 56" stroke="#0D47A1" stroke-width="1.3" fill="none" opacity="0.55"/>' +
                '<circle cx="100" cy="24" r="3.4" fill="#1E88E5" stroke="#0D47A1" stroke-width="1.2"/>' +
                '<path d="M 44 57 Q 100 51 156 57 Q 152 71 100 73 Q 48 71 44 57 Z" fill="#1E88E5" stroke="#0D47A1" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<path d="M 56 60 Q 100 55 144 60" stroke="#FFFFFF" stroke-width="1.3" fill="none" opacity="0.4"/>' +
                '<circle cx="100" cy="41" r="7.5" fill="#FFFFFF" stroke="#0D47A1" stroke-width="1.3"/>' +
                '<path d="M 100 36 L 101.8 39.8 L 106 40.2 L 102.9 43 L 103.8 47 L 100 44.9 L 96.2 47 L 97.1 43 L 94 40.2 L 98.2 39.8 Z" fill="#1565C0"/>' +
                '<path d="M 62 33 Q 56 42 55 51" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.28"/>'
        }
    };

    CAT['👑'] = {
        capa: 10,
        slots: {
            'cabeza':
                '<path d="M 58 52 L 61 22 L 82 38 L 100 13 L 118 38 L 139 22 L 142 52 Z" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="2.2" stroke-linejoin="round"/>' +
                '<rect x="57" y="45" width="86" height="11" rx="3.5" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.8"/>' +
                '<circle cx="61" cy="22" r="3.4" fill="#FF5252" stroke="#8A1A1A" stroke-width="1"/>' +
                '<circle cx="100" cy="13" r="3.8" fill="#40C4FF" stroke="#0D47A1" stroke-width="1"/>' +
                '<circle cx="139" cy="22" r="3.4" fill="#69F0AE" stroke="#1B7A45" stroke-width="1"/>' +
                '<path d="M 72 50.5 L 75 47.5 L 78 50.5 L 75 53.5 Z" fill="#FF5252" stroke="#8A1A1A" stroke-width="0.8"/>' +
                '<path d="M 98 50.5 L 100 47.5 L 102 50.5 L 100 53.5 Z" fill="#40C4FF" stroke="#0D47A1" stroke-width="0.8"/>' +
                '<path d="M 122 50.5 L 125 47.5 L 128 50.5 L 125 53.5 Z" fill="#69F0AE" stroke="#1B7A45" stroke-width="0.8"/>' +
                '<path d="M 66 44 L 68 30 M 90 40 L 96 24" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.5"/>'
        }
    };

    // ------------------------------------------------------------
    // LENTES (en la cara; siguen a la cabeza)
    // ------------------------------------------------------------
    CAT['👓'] = {
        capa: 10,
        slots: {
            'cara':
                '<ellipse cx="72" cy="108" rx="21" ry="17.5" fill="#BEE9FF" fill-opacity="0.16" stroke="#2B1B14" stroke-width="3.2"/>' +
                '<ellipse cx="128" cy="108" rx="21" ry="17.5" fill="#BEE9FF" fill-opacity="0.16" stroke="#2B1B14" stroke-width="3.2"/>' +
                '<path d="M 92 104 Q 100 98 108 104" stroke="#2B1B14" stroke-width="3" fill="none" stroke-linecap="round"/>' +
                '<path d="M 51 102 L 38 98 M 149 102 L 162 98" stroke="#2B1B14" stroke-width="2.6" stroke-linecap="round"/>' +
                '<path d="M 60 98 Q 66 94 73 94" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>' +
                '<path d="M 116 98 Q 122 94 129 94" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>'
        }
    };

    CAT['🕶️'] = {
        capa: 10,
        slots: {
            'cara':
                '<path d="M 50 100 Q 72 96 94 100 L 91 117 Q 84 127 72 127 Q 56 127 51 114 Z" fill="url(#ga-lente)" stroke="#000000" stroke-width="3.2" stroke-linejoin="round"/>' +
                '<path d="M 150 100 Q 128 96 106 100 L 109 117 Q 116 127 128 127 Q 144 127 149 114 Z" fill="url(#ga-lente)" stroke="#000000" stroke-width="3.2" stroke-linejoin="round"/>' +
                '<path d="M 93 103 Q 100 99 107 103" stroke="#000000" stroke-width="3.6" fill="none" stroke-linecap="round"/>' +
                '<path d="M 50 101 L 37 97 M 150 101 L 163 97" stroke="#000000" stroke-width="3" stroke-linecap="round"/>' +
                '<path d="M 57 106 L 66 104 M 60 112 L 72 109" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.45"/>' +
                '<path d="M 113 106 L 122 104 M 116 112 L 128 109" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.45"/>'
        }
    };

    // ------------------------------------------------------------
    // ACCESORIOS
    // ------------------------------------------------------------
    CAT['📿'] = {
        capa: 40,
        slots: {
            'torso':
                '<path d="M 80 165 Q 100 200 120 165" fill="none" stroke="#8A6A10" stroke-width="3.6" stroke-linecap="round"/>' +
                '<path d="M 80 165 Q 100 200 120 165" fill="none" stroke="#FFD54F" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3.2 1.2"/>' +
                '<circle cx="100" cy="193" r="7.4" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.6"/>' +
                '<circle cx="100" cy="193" r="3.8" fill="#40C4FF" stroke="#0D47A1" stroke-width="1"/>' +
                '<circle cx="98.6" cy="191.6" r="1.2" fill="#FFFFFF" opacity="0.95"/>' +
                '<path d="M 96 187 Q 100 185 104 187" stroke="#FFFFFF" stroke-width="1.4" fill="none" opacity="0.6" stroke-linecap="round"/>'
        }
    };

    function correaMochila() {
        return '<path d="M 67 164 L 80 164 L 79 238 Q 74 241 70 238 Z" fill="#C62828" stroke="#7F1414" stroke-width="1.8" stroke-linejoin="round"/>' +
               '<path d="M 70.5 170 L 70.5 234" stroke="#FFCDD2" stroke-width="1" stroke-dasharray="2.4 2" opacity="0.7"/>' +
               '<rect x="70" y="222" width="9" height="7" rx="1.5" fill="#E3E3EE" stroke="#7F1414" stroke-width="1"/>';
    }
    CAT['🎒'] = {
        capa: 35,
        slots: {
            'fondo':
                '<path d="M 91 161 Q 100 149 109 161" fill="none" stroke="#7F1414" stroke-width="3.4" stroke-linecap="round"/>' +
                '<rect x="46" y="159" width="108" height="84" rx="20" fill="url(#ga-rojo)" stroke="#7F1414" stroke-width="2.4"/>' +
                '<rect x="39" y="196" width="14" height="36" rx="6" fill="#B71C1C" stroke="#7F1414" stroke-width="1.8"/>' +
                '<rect x="147" y="196" width="14" height="36" rx="6" fill="#B71C1C" stroke="#7F1414" stroke-width="1.8"/>' +
                '<path d="M 56 168 Q 52 200 56 232" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.25"/>',
            'torso':
                correaMochila() + E(correaMochila()) +
                '<path d="M 79 202 Q 100 208 121 202" stroke="#7F1414" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
                '<rect x="95" y="203" width="10" height="7" rx="1.5" fill="#E3E3EE" stroke="#7F1414" stroke-width="1"/>'
        }
    };

    // Reloj en la muñeca derecha del dibujo (izquierda de Marquinhos)
    CAT['⌚'] = {
        capa: 40,
        slots: {
            'antebrazo-der':
                '<line x1="185.8" y1="220.2" x2="173.4" y2="226.6" stroke="#6D4C41" stroke-width="5.2" stroke-linecap="round"/>' +
                '<line x1="185.8" y1="220.2" x2="173.4" y2="226.6" stroke="#8D6E63" stroke-width="3.2" stroke-linecap="round"/>' +
                '<circle cx="179.6" cy="223.4" r="7" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.4"/>' +
                '<circle cx="179.6" cy="223.4" r="5" fill="#FFFFFF" stroke="#B8860B" stroke-width="0.8"/>' +
                '<path d="M 179.6 219.2 L 179.6 220.4 M 179.6 226.4 L 179.6 227.6 M 175.4 223.4 L 176.6 223.4 M 182.6 223.4 L 183.8 223.4" stroke="#0D47A1" stroke-width="0.8"/>' +
                '<path d="M 179.6 223.4 L 179.6 220.6" stroke="#0D47A1" stroke-width="1.1" stroke-linecap="round"/>' +
                '<path d="M 179.6 223.4 L 182.2 224.4" stroke="#0D47A1" stroke-width="1.1" stroke-linecap="round"/>' +
                '<circle cx="179.6" cy="223.4" r="0.9" fill="#C62828"/>'
        }
    };

    // Paraguas cerrado, sostenido en la mano
    CAT['☂️'] = {
        capa: 40,
        slots: {
            'mano-der':
                '<path d="M 185 190 Q 196 212 195 240 L 175 240 Q 174 212 185 190 Z" fill="url(#ga-paraguas)" stroke="#3A1A7A" stroke-width="1.8" stroke-linejoin="round"/>' +
                '<path d="M 185 192 L 185 240 M 180 204 Q 178 222 178.5 240 M 190 204 Q 192 222 191.5 240" stroke="#3A1A7A" stroke-width="1" fill="none" opacity="0.55"/>' +
                '<rect x="175" y="226" width="20" height="5" rx="2" fill="#4A148C" stroke="#2A0C5C" stroke-width="1"/>' +
                '<circle cx="185" cy="228.5" r="1.8" fill="#FFD54F"/>' +
                '<circle cx="185" cy="189" r="2" fill="#C9C9D6" stroke="#3A1A7A" stroke-width="0.8"/>' +
                '<line x1="185" y1="240" x2="185" y2="259" stroke="#8E8E9E" stroke-width="3.4" stroke-linecap="round"/>' +
                '<line x1="185" y1="240" x2="185" y2="259" stroke="#E3E3EE" stroke-width="1.4" stroke-linecap="round"/>' +
                '<path d="M 185 259 Q 185 269 177 269 Q 171.5 269 171.5 263" stroke="#5A3A1E" stroke-width="4.6" fill="none" stroke-linecap="round"/>' +
                '<path d="M 185 259 Q 185 269 177 269 Q 171.5 269 171.5 263" stroke="#9C6B3C" stroke-width="2" fill="none" stroke-linecap="round"/>'
        }
    };

    // ------------------------------------------------------------
    // CUERPO BASE (copia estática del Marquinhos del pet, para la tienda)
    // ------------------------------------------------------------
    var CUERPO_BASE = "<defs><linearGradient id=\"mq-grad-cabeza\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"#FFFFFF\"/><stop offset=\"50%\" stop-color=\"#D4EEFF\"/><stop offset=\"100%\" stop-color=\"#C9D8FF\"/></linearGradient><linearGradient id=\"mq-grad-cuerpo\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"#B8ECFF\"/><stop offset=\"40%\" stop-color=\"#C9BCFF\"/><stop offset=\"100%\" stop-color=\"#B69CFF\"/></linearGradient><radialGradient id=\"mq-grad-antena-on\" cx=\"50%\" cy=\"50%\"><stop offset=\"0%\" stop-color=\"#FFFFFF\"/><stop offset=\"30%\" stop-color=\"#00E5FF\"/><stop offset=\"70%\" stop-color=\"#7C4DFF\"/><stop offset=\"100%\" stop-color=\"#5E35B1\"/></radialGradient><radialGradient id=\"mq-grad-antena-off\" cx=\"50%\" cy=\"50%\"><stop offset=\"0%\" stop-color=\"#B0C4DE\"/><stop offset=\"70%\" stop-color=\"#7A8FA8\"/><stop offset=\"100%\" stop-color=\"#5A6B82\"/></radialGradient><radialGradient id=\"mq-grad-iris\" cx=\"50%\" cy=\"45%\"><stop offset=\"0%\" stop-color=\"#C8F4FF\"/><stop offset=\"60%\" stop-color=\"#5CCBFF\"/><stop offset=\"100%\" stop-color=\"#2E8FE0\"/></radialGradient><linearGradient id=\"mq-grad-bota\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\"><stop offset=\"0%\" stop-color=\"#7C4DFF\"/><stop offset=\"100%\" stop-color=\"#00C8FF\"/></linearGradient><radialGradient id=\"mq-grad-aura\" cx=\"50%\" cy=\"50%\"><stop offset=\"0%\" stop-color=\"#7C4DFF\" stop-opacity=\"0.55\"/><stop offset=\"100%\" stop-color=\"#7C4DFF\" stop-opacity=\"0\"/></radialGradient></defs><ellipse cx=\"100\" cy=\"140\" rx=\"85\" ry=\"110\" fill=\"url(#mq-grad-aura)\" opacity=\"0.6\"><animate attributeName=\"opacity\" values=\"0.3;0.7;0.3\" dur=\"3s\" repeatCount=\"indefinite\"/></ellipse><g id=\"mq-acc-layer-fondo\"></g><g id=\"mq-cuerpo\"><g id=\"mq-acc-fondo\" data-acc-slot=\"fondo\"></g><g id=\"mq-cabeza-grupo\"><rect x=\"35\" y=\"40\" width=\"130\" height=\"120\" rx=\"28\" ry=\"28\" fill=\"url(#mq-grad-cabeza)\" stroke=\"#0D47A1\" stroke-width=\"3\"/><ellipse cx=\"70\" cy=\"58\" rx=\"25\" ry=\"9\" fill=\"#FFFFFF\" opacity=\"0.6\"/><g id=\"mq-cejas\"><path id=\"mq-ceja-izq\" d=\"M 56 82 Q 72 73 88 78\" stroke=\"#0D47A1\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/><path id=\"mq-ceja-der\" d=\"M 112 78 Q 128 73 144 82\" stroke=\"#0D47A1\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\"/></g><g id=\"mq-ojo-izq\" class=\"mq-ojo\"><ellipse cx=\"72\" cy=\"108\" rx=\"16\" ry=\"14\" fill=\"#1B3A8A\" stroke=\"#0D47A1\" stroke-width=\"2\"/><ellipse cx=\"72\" cy=\"108\" rx=\"12.5\" ry=\"11\" fill=\"url(#mq-grad-iris)\"/><circle id=\"mq-pupila-izq\" cx=\"72\" cy=\"108\" r=\"4.2\" fill=\"#0D2A66\"/><circle cx=\"77\" cy=\"103\" r=\"3\" fill=\"#FFFFFF\" opacity=\"0.95\"/><circle cx=\"68\" cy=\"112\" r=\"1.4\" fill=\"#FFFFFF\" opacity=\"0.7\"/></g><g id=\"mq-ojo-der\" class=\"mq-ojo\"><ellipse cx=\"128\" cy=\"108\" rx=\"16\" ry=\"14\" fill=\"#1B3A8A\" stroke=\"#0D47A1\" stroke-width=\"2\"/><ellipse cx=\"128\" cy=\"108\" rx=\"12.5\" ry=\"11\" fill=\"url(#mq-grad-iris)\"/><circle id=\"mq-pupila-der\" cx=\"128\" cy=\"108\" r=\"4.2\" fill=\"#0D2A66\"/><circle cx=\"133\" cy=\"103\" r=\"3\" fill=\"#FFFFFF\" opacity=\"0.95\"/><circle cx=\"124\" cy=\"112\" r=\"1.4\" fill=\"#FFFFFF\" opacity=\"0.7\"/></g><path id=\"mq-boca\" class=\"mq-pet-boca\" d=\"M 78 137 Q 100 150 122 137\" stroke=\"#0D47A1\" stroke-width=\"3.5\" stroke-linejoin=\"round\" fill=\"none\" stroke-linecap=\"round\"/><g id=\"mq-acc-cara\" data-acc-slot=\"cara\"></g><g id=\"mq-acc-cabeza\" data-acc-slot=\"cabeza\"></g><g id=\"mq-antena\"><line x1=\"100\" y1=\"40\" x2=\"100\" y2=\"12\" stroke=\"#0D47A1\" stroke-width=\"3\" stroke-linecap=\"round\"/><g id=\"mq-antena-apagada\" visibility=\"visible\"><circle cx=\"100\" cy=\"6\" r=\"9\" fill=\"url(#mq-grad-antena-off)\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/></g><g id=\"mq-antena-encendida\" visibility=\"hidden\"><circle cx=\"100\" cy=\"6\" r=\"14\" fill=\"#00E5FF\" opacity=\"0.5\"><animate attributeName=\"r\" values=\"14;23;14\" dur=\"0.9s\" repeatCount=\"indefinite\"/><animate attributeName=\"opacity\" values=\"0.65;0.12;0.65\" dur=\"0.9s\" repeatCount=\"indefinite\"/></circle><circle cx=\"100\" cy=\"6\" r=\"10\" fill=\"url(#mq-grad-antena-on)\" stroke=\"#0D47A1\" stroke-width=\"1.5\"><animate attributeName=\"r\" values=\"10;12.5;10\" dur=\"0.9s\" repeatCount=\"indefinite\"/></circle></g></g></g><rect x=\"88\" y=\"158\" width=\"24\" height=\"12\" fill=\"#A8C4DE\" stroke=\"#0D47A1\" stroke-width=\"2\"/><g id=\"mq-torso\"><path d=\"M 60 170 Q 60 165 65 165 L 135 165 Q 140 165 140 170 L 140 235 Q 140 250 125 250 L 75 250 Q 60 250 60 235 Z\" fill=\"url(#mq-grad-cuerpo)\" stroke=\"#0D47A1\" stroke-width=\"3\"/><ellipse cx=\"100\" cy=\"185\" rx=\"30\" ry=\"10\" fill=\"#FFFFFF\" opacity=\"0.5\"/><rect x=\"70\" y=\"185\" width=\"60\" height=\"22\" rx=\"6\" fill=\"#0D47A1\"/><text x=\"100\" y=\"200\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"9\" font-weight=\"800\" fill=\"#FFFFFF\" letter-spacing=\"0.5\">MARQUINHOS</text><circle cx=\"80\" cy=\"235\" r=\"3\" fill=\"#7C4DFF\" opacity=\"0.9\"><animate attributeName=\"opacity\" values=\"0.5;1;0.5\" dur=\"2s\" repeatCount=\"indefinite\"/></circle><circle cx=\"120\" cy=\"235\" r=\"3\" fill=\"#00E5FF\" opacity=\"0.9\"><animate attributeName=\"opacity\" values=\"0.5;1;0.5\" dur=\"2s\" repeatCount=\"indefinite\" begin=\"1s\"/></circle></g><g id=\"mq-acc-torso\" data-acc-slot=\"torso\"></g><g id=\"mq-brazo-izq\" class=\"mq-brazo\"><line x1=\"60\" y1=\"180\" x2=\"30\" y2=\"205\" stroke=\"#0D47A1\" stroke-width=\"12.5\" stroke-linecap=\"round\"/><line x1=\"60\" y1=\"180\" x2=\"30\" y2=\"205\" stroke=\"#C9D8FF\" stroke-width=\"9\" stroke-linecap=\"round\"/><g id=\"mq-acc-brazo-izq\" data-acc-slot=\"brazo-izq\"></g><g id=\"mq-antebrazo-izq\" class=\"mq-antebrazo\"><line x1=\"30\" y1=\"205\" x2=\"18\" y2=\"228\" stroke=\"#0D47A1\" stroke-width=\"11.5\" stroke-linecap=\"round\"/><line x1=\"30\" y1=\"205\" x2=\"18\" y2=\"228\" stroke=\"#C9D8FF\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"18\" cy=\"228\" r=\"3.8\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><g id=\"mq-acc-antebrazo-izq\" data-acc-slot=\"antebrazo-izq\"></g><g id=\"mq-mano-izq\" class=\"mq-mano\"><g id=\"mq-acc-mano-izq\" data-acc-slot=\"mano-izq\"></g><g class=\"mq-dedo\" data-o=\"10 238\" data-s=\"1\"><line x1=\"10\" y1=\"238\" x2=\"6\" y2=\"249\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"10\" y1=\"238\" x2=\"6\" y2=\"249\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"6\" cy=\"249\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"15 240\" data-s=\"0\"><line x1=\"15\" y1=\"240\" x2=\"14\" y2=\"252\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"15\" y1=\"240\" x2=\"14\" y2=\"252\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"14\" cy=\"252\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"20 238\" data-s=\"-1\"><line x1=\"20\" y1=\"238\" x2=\"23\" y2=\"249\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"20\" y1=\"238\" x2=\"23\" y2=\"249\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"23\" cy=\"249\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"21 232\" data-s=\"-1\"><line x1=\"21\" y1=\"232\" x2=\"28\" y2=\"238\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"21\" y1=\"232\" x2=\"28\" y2=\"238\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"28\" cy=\"238\" r=\"1.6\" fill=\"#7C4DFF\"/></g><ellipse cx=\"15\" cy=\"233\" rx=\"8\" ry=\"7.5\" fill=\"#C9D8FF\" stroke=\"#0D47A1\" stroke-width=\"2\"/></g></g><circle cx=\"30\" cy=\"205\" r=\"4.5\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><g id=\"mq-acc-codo-izq\" data-acc-slot=\"codo-izq\"></g></g><g id=\"mq-brazo-der\" class=\"mq-brazo\"><line x1=\"140\" y1=\"180\" x2=\"170\" y2=\"205\" stroke=\"#0D47A1\" stroke-width=\"12.5\" stroke-linecap=\"round\"/><line x1=\"140\" y1=\"180\" x2=\"170\" y2=\"205\" stroke=\"#C9D8FF\" stroke-width=\"9\" stroke-linecap=\"round\"/><g id=\"mq-acc-brazo-der\" data-acc-slot=\"brazo-der\"></g><g id=\"mq-antebrazo-der\" class=\"mq-antebrazo\"><line x1=\"170\" y1=\"205\" x2=\"182\" y2=\"228\" stroke=\"#0D47A1\" stroke-width=\"11.5\" stroke-linecap=\"round\"/><line x1=\"170\" y1=\"205\" x2=\"182\" y2=\"228\" stroke=\"#C9D8FF\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"182\" cy=\"228\" r=\"3.8\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><g id=\"mq-acc-antebrazo-der\" data-acc-slot=\"antebrazo-der\"></g><g id=\"mq-mano-der\" class=\"mq-mano\"><g id=\"mq-acc-mano-der\" data-acc-slot=\"mano-der\"></g><g class=\"mq-dedo\" data-o=\"190 238\" data-s=\"-1\"><line x1=\"190\" y1=\"238\" x2=\"194\" y2=\"249\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"190\" y1=\"238\" x2=\"194\" y2=\"249\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"194\" cy=\"249\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"185 240\" data-s=\"0\"><line x1=\"185\" y1=\"240\" x2=\"186\" y2=\"252\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"185\" y1=\"240\" x2=\"186\" y2=\"252\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"186\" cy=\"252\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"180 238\" data-s=\"1\"><line x1=\"180\" y1=\"238\" x2=\"177\" y2=\"249\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"180\" y1=\"238\" x2=\"177\" y2=\"249\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"177\" cy=\"249\" r=\"1.6\" fill=\"#7C4DFF\"/></g><g class=\"mq-dedo\" data-o=\"179 232\" data-s=\"1\"><line x1=\"179\" y1=\"232\" x2=\"172\" y2=\"238\" stroke=\"#0D47A1\" stroke-width=\"7.5\" stroke-linecap=\"round\"/><line x1=\"179\" y1=\"232\" x2=\"172\" y2=\"238\" stroke=\"#DCE6FF\" stroke-width=\"4.5\" stroke-linecap=\"round\"/><circle cx=\"172\" cy=\"238\" r=\"1.6\" fill=\"#7C4DFF\"/></g><ellipse cx=\"185\" cy=\"233\" rx=\"8\" ry=\"7.5\" fill=\"#C9D8FF\" stroke=\"#0D47A1\" stroke-width=\"2\"/></g></g><circle cx=\"170\" cy=\"205\" r=\"4.5\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><g id=\"mq-acc-codo-der\" data-acc-slot=\"codo-der\"></g></g><g id=\"mq-pierna-izq\" class=\"mq-pierna\"><line x1=\"82\" y1=\"250\" x2=\"82\" y2=\"268\" stroke=\"#C9D8FF\" stroke-width=\"10\" stroke-linecap=\"round\"/><line x1=\"82\" y1=\"250\" x2=\"82\" y2=\"268\" stroke=\"#0D47A1\" stroke-width=\"2.5\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"82\" cy=\"268\" r=\"3.5\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><line x1=\"82\" y1=\"268\" x2=\"82\" y2=\"278\" stroke=\"#C9D8FF\" stroke-width=\"9\" stroke-linecap=\"round\"/><line x1=\"82\" y1=\"268\" x2=\"82\" y2=\"278\" stroke=\"#0D47A1\" stroke-width=\"2.5\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M 70 278 Q 70 290 82 290 Q 94 290 94 282 L 94 278 Z\" fill=\"url(#mq-grad-bota)\" stroke=\"#0D47A1\" stroke-width=\"2\"/><g id=\"mq-acc-pierna-izq\" data-acc-slot=\"pierna-izq\"></g><g id=\"mq-acc-pie-izq\" data-acc-slot=\"pie-izq\"></g></g><g id=\"mq-pierna-der\" class=\"mq-pierna\"><line x1=\"118\" y1=\"250\" x2=\"118\" y2=\"268\" stroke=\"#C9D8FF\" stroke-width=\"10\" stroke-linecap=\"round\"/><line x1=\"118\" y1=\"250\" x2=\"118\" y2=\"268\" stroke=\"#0D47A1\" stroke-width=\"2.5\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"118\" cy=\"268\" r=\"3.5\" fill=\"#7C4DFF\" stroke=\"#0D47A1\" stroke-width=\"1.5\"/><line x1=\"118\" y1=\"268\" x2=\"118\" y2=\"278\" stroke=\"#C9D8FF\" stroke-width=\"9\" stroke-linecap=\"round\"/><line x1=\"118\" y1=\"268\" x2=\"118\" y2=\"278\" stroke=\"#0D47A1\" stroke-width=\"2.5\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M 106 278 Q 106 290 118 290 Q 130 290 130 282 L 130 278 Z\" fill=\"url(#mq-grad-bota)\" stroke=\"#0D47A1\" stroke-width=\"2\"/><g id=\"mq-acc-pierna-der\" data-acc-slot=\"pierna-der\"></g><g id=\"mq-acc-pie-der\" data-acc-slot=\"pie-der\"></g></g><g id=\"mq-acc-cuerpo-frente\" data-acc-slot=\"cuerpo-frente\"></g></g><g id=\"mq-acc-layer\"></g>";

    // ------------------------------------------------------------
    // API
    // ------------------------------------------------------------
    function partes(svgData) {
        if (!svgData || typeof svgData !== 'string') return null;
        return CAT[svgData.trim()] || null;
    }

    function asegurarDefs(raiz) {
        if (raiz.querySelector('#mq-acc-defs')) return;
        var d = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        d.setAttribute('id', 'mq-acc-defs');
        d.innerHTML = DEFS;
        raiz.insertBefore(d, raiz.firstChild);
    }

    // Pone cada prenda en su sitio. Devuelve los svg_data que NO conoce
    // (para que quien llama los dibuje como emoji de respaldo).
    function aplicar(raiz, lista) {
        if (!raiz) return lista || [];
        asegurarDefs(raiz);

        var contenedores = {};
        SLOTS.forEach(function (s) {
            var c = raiz.querySelector('[data-acc-slot="' + s + '"]');
            if (c) { c.innerHTML = ''; contenedores[s] = c; }
        });

        var desconocidos = [];
        var items = [];
        (lista || []).forEach(function (sd) {
            var p = partes(sd);
            if (p) items.push(p); else if (sd) desconocidos.push(sd);
        });
        items.sort(function (a, b) { return a.capa - b.capa; });

        items.forEach(function (p) {
            Object.keys(p.slots).forEach(function (slot) {
                var c = contenedores[slot];
                if (c) c.insertAdjacentHTML('beforeend', p.slots[slot]);
            });
        });
        return desconocidos;
    }

    function combinado(svgData) {
        var p = partes(svgData);
        if (!p) return null;
        return Object.keys(p.slots).map(function (k) { return p.slots[k]; }).join('');
    }

    window.MarquinhosAccesoriosSVG = {
        // v2
        partes: partes,
        aplicar: aplicar,
        cuerpoBase: function () { return CUERPO_BASE; },
        defs: function () { return DEFS; },
        slots: SLOTS.slice(),

        // compatibilidad con la v1.x
        get: function (svgData) { return combinado(svgData); },
        esSVG: function (svgData) {
            return !!svgData && typeof svgData === 'string' && svgData.trim().indexOf('<') === 0;
        },
        render: function (svgData) {
            if (!svgData || typeof svgData !== 'string') return null;
            var t = svgData.trim();
            if (t.indexOf('<') === 0) return t;
            return combinado(t);
        },
        _disponibles: function () { return Object.keys(CAT); }
    };

    console.log('[Marquinhos/AccesoriosSVG] ✅ v2.0 cargada · ' + Object.keys(CAT).length + ' prendas');
})(window);
