// ================================================================
// DISFRACES TEMÁTICOS v2.1 — Halloween · Santa · Reyes Magos
// Pegar justo antes de "// API"
// ================================================================

var NARANJA = '#FF8A1F', NARANJA_B = '#8A3E00';
var ROJO_SA = '#C62828', ROJO_SA_B = '#6E0B0B';

function torsoTunica(c, d) {
    return '<path d="M 57 172 Q 57 163 66 163 L 134 163 Q 143 163 143 172 L 143 240 Q 143 253 130 253 L 70 253 Q 57 253 57 240 Z" fill="' + c + '" stroke="' + d + '" stroke-width="2.6" stroke-linejoin="round"/>';
}
function mangasCortas(c, d, hem) {
    return { 'brazo-izq': mangaCorta(c, d, hem), 'brazo-der': E(mangaCorta(c, d, hem)) };
}
function mangasLargas(c, d, puno, punoB) {
    return {
        'brazo-izq': mangaLargaBrazo(c, d), 'brazo-der': E(mangaLargaBrazo(c, d)),
        'codo-izq': mangaLargaCodo(c, d), 'codo-der': E(mangaLargaCodo(c, d)),
        'antebrazo-izq': mangaLargaAntebrazo(c, d, puno, punoB),
        'antebrazo-der': E(mangaLargaAntebrazo(c, d, puno, punoB))
    };
}
function unir(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) o[k] = (o[k] || '') + b[k];
    return o;
}

// ---------- HALLOWEEN · CALABAZA ----------
CAT['hw-calabaza-sombrero'] = { capa: 10, slots: { cabeza:
    '<path d="M 58 44 Q 52 18 100 18 Q 148 18 142 44 Q 100 54 58 44 Z" fill="' + NARANJA + '" stroke="' + NARANJA_B + '" stroke-width="2.4"/>' +
    '<path d="M 76 22 Q 70 36 74 50 M 100 19 Q 96 36 100 52 M 124 22 Q 130 36 126 50" stroke="' + NARANJA_B + '" stroke-width="1.6" fill="none" opacity="0.6"/>' +
    '<path d="M 96 18 L 94 6 Q 100 2 108 6 L 104 18 Z" fill="#4E7A1E" stroke="#2A4A0E" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M 66 30 Q 62 38 64 46" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.3"/>'
}};

CAT['hw-calabaza-playera'] = { capa: 20, slots: unir(mangasCortas(NARANJA, NARANJA_B, '#FFB366'), { torso:
    torsoTunica(NARANJA, NARANJA_B) +
    '<path d="M 66 174 Q 63 205 67 236" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.25"/>' +
    '<path d="M 82 196 L 92 196 L 87 204 Z M 108 196 L 118 196 L 113 204 Z" fill="#2A1200"/>' +
    '<path d="M 80 218 L 90 228 L 100 218 L 110 228 L 120 218 L 120 222 Q 100 242 80 222 Z" fill="#2A1200"/>'
}) };

// ---------- HALLOWEEN · VAMPIRO ----------
CAT['hw-vampiro-capa'] = { capa: 5, slots: { fondo:
    '<path d="M 66 150 L 28 152 Q 20 200 26 262 L 100 276 L 174 262 Q 180 200 172 152 L 134 150 L 100 172 Z" fill="#1A0A24" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>'
}};

CAT['hw-vampiro-camisa'] = { capa: 20, slots: unir(mangasCortas('#1A0A24', '#000000', '#3A1F4A'), { torso:
    torsoTunica('#F4F4F8', '#2A2A3A') +
    '<path d="M 76 164 L 100 196 L 124 164 L 128 174 L 100 206 L 72 174 Z" fill="#1A0A24" stroke="#000000" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M 92 196 L 100 200 L 108 196 L 106 204 L 100 202 L 94 204 Z" fill="#000000"/>' +
    '<circle cx="100" cy="218" r="2" fill="#111111"/><circle cx="100" cy="234" r="2" fill="#111111"/>'
}) };

CAT['hw-vampiro-colmillos'] = { capa: 10, slots: { cara:
    '<path d="M 89 139 L 92 151 L 95 139 Z" fill="#FFFFFF" stroke="#7A7A8A" stroke-width="1"/>' +
    '<path d="M 105 139 L 108 151 L 111 139 Z" fill="#FFFFFF" stroke="#7A7A8A" stroke-width="1"/>'
}};

// ---------- HALLOWEEN · ESQUELETO / FANTASMA ----------
CAT['hw-esqueleto-capucha'] = { capa: 15, slots: { cabeza:
    '<path d="M 24 158 Q 16 26 100 14 Q 184 26 176 158 L 160 158 Q 162 58 100 50 Q 38 58 40 158 Z" fill="#1E1E2C" stroke="#000000" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M 40 158 Q 38 58 100 50 Q 162 58 160 158" fill="none" stroke="#9FE8FF" stroke-width="1.6" opacity="0.6"/>' +
    '<path d="M 60 40 Q 66 30 78 28" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.2"/>'
}};

CAT['hw-esqueleto-torso'] = { capa: 20, slots: unir(mangasCortas('#1E1E2C', '#000000', '#9FE8FF'), { torso:
    torsoTunica('#1E1E2C', '#000000') +
    '<path d="M 80 186 Q 100 192 120 186 M 78 202 Q 100 208 122 202 M 78 218 Q 100 224 122 218 M 80 234 Q 100 240 120 234" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
    '<path d="M 100 180 L 100 242" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="4 2"/>'
}) };

CAT['hw-esqueleto-cara'] = { capa: 10, slots: { cara:
    '<rect x="84" y="136" width="32" height="10" rx="2" fill="#FFFFFF" stroke="#000000" stroke-width="1.2"/>' +
    '<path d="M 92 136 V 146 M 100 136 V 146 M 108 136 V 146" stroke="#000000" stroke-width="1"/>'
}};

// ---------- SANTA CLAUS ----------
CAT['sa-gorro'] = { capa: 10, slots: { cabeza:
    '<path d="M 44 40 Q 48 10 100 14 Q 118 16 126 14 Q 140 26 142 42 Z" fill="#D32F2F" stroke="#7F1414" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="130" cy="14" r="8" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1.2"/>' +
    '<rect x="36" y="36" width="128" height="14" rx="7" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1.5"/>'
}};

CAT['sa-barba'] = { capa: 30, slots: { cara:
    '<path d="M 52 124 Q 56 158 100 160 Q 144 158 148 124 Q 138 134 100 134 Q 62 134 52 124 Z" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M 80 130 Q 90 124 100 130 Q 110 124 120 130 Q 110 134 100 133 Q 90 134 80 130 Z" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1.2"/>'
}};

CAT['sa-chaqueta'] = { capa: 20, slots: unir(mangasLargas(ROJO_SA, ROJO_SA_B, '#FFFFFF', '#BDBDBD'), { torso:
    torsoTunica(ROJO_SA, ROJO_SA_B) +
    '<path d="M 80 164 Q 100 182 120 164 L 124 176 Q 100 194 76 176 Z" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1"/>' +
    '<path d="M 58 238 L 142 238 L 142 248 Q 142 253 136 253 L 64 253 Q 58 253 58 248 Z" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="1"/>' +
    '<rect x="58" y="222" width="84" height="8" fill="#111111"/>' +
    '<rect x="94" y="221" width="12" height="10" rx="1.5" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1"/>'
}) };

function pantalonNegro() {
    return '<rect x="72" y="246" width="20" height="31" rx="5" fill="#1A1A22" stroke="#000000" stroke-width="2"/>';
}
CAT['sa-pantalon'] = { capa: 10, slots: {
    torso: '<path d="' + CINTURA + '" fill="#1A1A22" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>',
    'pierna-izq': pantalonNegro(),
    'pierna-der': E(pantalonNegro())
}};

// ---------- REY MELCHOR (dorado, barba blanca, capa roja) ----------
CAT['rm-corona'] = { capa: 10, slots: { cabeza:
    '<path d="M 56 46 L 58 22 L 80 36 L 100 12 L 120 36 L 142 22 L 144 46 Z" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="2" stroke-linejoin="round"/>' +
    '<rect x="54" y="42" width="92" height="11" rx="3.5" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.6"/>' +
    '<circle cx="58" cy="22" r="3.2" fill="#FF5252" stroke="#8A1A1A" stroke-width="1"/>' +
    '<circle cx="100" cy="12" r="3.6" fill="#40C4FF" stroke="#0D47A1" stroke-width="1"/>' +
    '<circle cx="142" cy="22" r="3.2" fill="#FF5252" stroke="#8A1A1A" stroke-width="1"/>' +
    '<circle cx="100" cy="47" r="3" fill="#69F0AE" stroke="#1B7A45" stroke-width="0.9"/>'
}};

CAT['rm-barba'] = { capa: 30, slots: { cara:
    '<path d="M 54 120 Q 56 164 100 170 Q 144 164 146 120 Q 136 134 100 134 Q 64 134 54 120 Z" fill="#F5F5F5" stroke="#9E9E9E" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M 78 130 Q 89 123 100 130 Q 111 123 122 130 Q 111 135 100 134 Q 89 135 78 130 Z" fill="#FFFFFF" stroke="#9E9E9E" stroke-width="1.2"/>'
}};

CAT['rm-tunica'] = { capa: 20, slots: unir(mangasLargas('#FFC107', '#8A5A00', '#FFF2A8', '#8A5A00'), { torso:
    torsoTunica('#FFC107', '#8A5A00') +
    '<rect x="58" y="226" width="84" height="7" fill="#8A5A00"/>' +
    '<path d="M 100 170 L 100 250" stroke="#FFF2A8" stroke-width="3" opacity="0.7"/>'
}) };

CAT['rm-capa'] = { capa: 5, slots: { fondo:
    '<path d="M 62 168 L 40 266 Q 100 280 160 266 L 138 168 Z" fill="#B71C1C" stroke="#5E0B0B" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M 40 266 Q 100 280 160 266" stroke="#FFD54F" stroke-width="3" fill="none"/>'
}};

// ---------- REY GASPAR (verde esmeralda, turbante) ----------
CAT['rg-turbante'] = { capa: 10, slots: { cabeza:
    '<path d="M 46 52 Q 40 22 100 14 Q 160 22 154 52 Q 100 44 46 52 Z" fill="#2E7D32" stroke="#0F3D12" stroke-width="2"/>' +
    '<path d="M 48 46 Q 100 36 152 46 L 152 54 Q 100 44 48 54 Z" fill="url(#ga-dorado)" stroke="#8A6A10" stroke-width="1.2"/>' +
    '<circle cx="100" cy="30" r="4.2" fill="#FF5252" stroke="#8A1A1A" stroke-width="1"/>' +
    '<path d="M 68 26 Q 62 36 62 46 M 132 26 Q 138 36 138 46" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.3"/>'
}};

CAT['rg-tunica'] = { capa: 20, slots: unir(mangasLargas('#2E7D32', '#0F3D12', '#FFD54F', '#8A6A10'), { torso:
    torsoTunica('#2E7D32', '#0F3D12') +
    '<path d="M 80 165 Q 100 190 120 165 L 120 172 Q 100 198 80 172 Z" fill="#FFD54F" stroke="#8A6A10" stroke-width="1"/>' +
    '<rect x="58" y="226" width="84" height="7" fill="#FFD54F" stroke="#8A6A10" stroke-width="1"/>' +
    '<path d="M 100 200 L 100 250" stroke="#FFD54F" stroke-width="2" stroke-dasharray="3 3"/>'
}) };

// ---------- REY BALTASAR (morado, perlas) ----------
CAT['rb-turbante'] = { capa: 10, slots: { cabeza:
    '<path d="M 46 52 Q 40 22 100 14 Q 160 22 154 52 Q 100 44 46 52 Z" fill="#6A1B9A" stroke="#2E0A44" stroke-width="2"/>' +
    '<path d="M 48 46 Q 100 36 152 46 L 152 54 Q 100 44 48 54 Z" fill="#8E24AA" stroke="#2E0A44" stroke-width="1.2"/>' +
    '<circle cx="66" cy="45" r="2.2" fill="#FFFFFF"/><circle cx="80" cy="42" r="2.2" fill="#FFFFFF"/><circle cx="94" cy="40" r="2.2" fill="#FFFFFF"/>' +
    '<circle cx="108" cy="40" r="2.2" fill="#FFFFFF"/><circle cx="122" cy="42" r="2.2" fill="#FFFFFF"/><circle cx="136" cy="45" r="2.2" fill="#FFFFFF"/>' +
    '<path d="M 68 26 Q 62 36 62 46" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.25"/>'
}};

CAT['rb-tunica'] = { capa: 20, slots: unir(mangasLargas('#6A1B9A', '#2E0A44', '#E1BEE7', '#2E0A44'), { torso:
    torsoTunica('#6A1B9A', '#2E0A44') +
    '<circle cx="78" cy="168" r="2.4" fill="#FFFFFF"/><circle cx="86" cy="172" r="2.4" fill="#FFFFFF"/><circle cx="94" cy="175" r="2.4" fill="#FFFFFF"/>' +
    '<circle cx="106" cy="175" r="2.4" fill="#FFFFFF"/><circle cx="114" cy="172" r="2.4" fill="#FFFFFF"/><circle cx="122" cy="168" r="2.4" fill="#FFFFFF"/>' +
    '<rect x="58" y="226" width="84" height="7" fill="#E1BEE7" stroke="#2E0A44" stroke-width="1"/>'
}) };

CAT['rb-manto'] = { capa: 5, slots: { fondo:
    '<path d="M 60 168 L 42 262 Q 100 276 158 262 L 140 168 Z" fill="#4A148C" stroke="#2E0A44" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M 42 262 Q 100 276 158 262" stroke="#FFD54F" stroke-width="3" fill="none"/>'
}};

// ---------- PAQUETES (conjuntos) ----------
var PACKS = {
    'pack-halloween-calabaza':   ['hw-calabaza-sombrero', 'hw-calabaza-playera', '👞'],
    'pack-halloween-vampiro':    ['hw-vampiro-capa', 'hw-vampiro-camisa', 'hw-vampiro-colmillos', '👞'],
    'pack-halloween-esqueleto':  ['hw-esqueleto-capucha', 'hw-esqueleto-torso', 'hw-esqueleto-cara', '👖'],
    'pack-santa':                ['sa-gorro', 'sa-barba', 'sa-chaqueta', 'sa-pantalon', '👞'],
    'pack-melchor':              ['rm-corona', 'rm-barba', 'rm-tunica', 'rm-capa', '🩴'],
    'pack-gaspar':               ['rg-turbante', 'rg-tunica', '👞'],
    'pack-baltasar':             ['rb-turbante', 'rb-tunica', 'rb-manto', '🩴']
};

function expandir(lista) {
    var out = [];
    (lista || []).forEach(function (sd) {
        var k = String(sd || '').trim();
        if (PACKS[k]) out.push.apply(out, PACKS[k]); else out.push(sd);
    });
    return out;
}