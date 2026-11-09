// ================================================================
// scripts/build-config.mjs
// Genera backend/public/features/shared/js/api-config.js en el build
// de Cloudflare Pages. Define window.API_BASE y reescribe las
// peticiones fetch que empiezan con /api/ hacia el backend en Railway.
//
// Variable requerida en Pages:
//   API_BASE_URL = https://galleta-domo-production.up.railway.app
// ================================================================

import { writeFileSync, mkdirSync } from 'node:fs';

const apiBase = (process.env.API_BASE_URL || '').replace(/\/$/, '');

if (!/^https:\/\/[a-z0-9.-]+$/i.test(apiBase)) {
    throw new Error('API_BASE_URL debe ser una URL https válida, sin rutas');
}

const contenido = `// Generado en el build. No editar a mano.
window.API_BASE = ${JSON.stringify(apiBase)};

(function () {
    'use strict';

    var base = window.API_BASE;
    if (!base) return;

    // Evita envolver dos veces si el script se carga más de una vez
    if (window.__apiShimActivo) return;
    window.__apiShimActivo = true;

    var fetchOriginal = window.fetch.bind(window);

    window.fetch = function (input, init) {
        if (typeof input === 'string' && input.indexOf('/api/') === 0) {
            input = base + input;
        } else if (input instanceof Request) {
            var url = input.url;
            var ruta = new URL(url, window.location.href);
            if (ruta.origin === window.location.origin && ruta.pathname.indexOf('/api/') === 0) {
                input = new Request(base + ruta.pathname + ruta.search, input);
            }
        }
        return fetchOriginal(input, init);
    };

    window.apiUrl = function (path) {
        return base + (path.charAt(0) === '/' ? path : '/' + path);
    };
})();
`;

mkdirSync('backend/public/features/shared/js', { recursive: true });
writeFileSync('backend/public/features/shared/js/api-config.js', contenido);

console.log('✅ api-config.js generado para', apiBase);