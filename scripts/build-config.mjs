import { writeFileSync, mkdirSync } from 'node:fs';

const apiBase = (process.env.API_BASE_URL || '').replace(/\/$/, '');

if (!/^https:\/\/[a-z0-9.-]+$/i.test(apiBase)) {
    throw new Error('API_BASE_URL debe ser una URL https válida, sin rutas');
}

mkdirSync('backend/public/features/shared/js', { recursive: true });
writeFileSync(
    'backend/public/features/shared/js/api-config.js',
    `// Generado en el build. No editar a mano.\nwindow.API_BASE = ${JSON.stringify(apiBase)};\n`
);

console.log('✅ api-config.js generado para', apiBase);