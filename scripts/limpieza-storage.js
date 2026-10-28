// scripts/limpieza-storage.js
// Limpieza de archivos huérfanos en Supabase Storage.
//
// Uso:
//   node scripts/limpieza-storage.js candidatos-19.json            (simulación, no borra)
//   node scripts/limpieza-storage.js candidatos-19.json --confirm  (borra de verdad)
//
// Cada candidato debe tener: { "bucket", "path", "created_at" }.
// El script solo borra si el archivo tiene más de 24 h y ninguna
// columna de la lista COLUMNAS lo referencia.

require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

const CONFIRMAR = process.argv.includes('--confirm');
const ARCHIVO = process.argv[2];
const GRACIA_MS = 24 * 60 * 60 * 1000;

// Columnas que guardan URL de Storage. Si agregas tablas nuevas con
// URLs de archivos, agrégalas aquí; si no, el script podría borrar
// archivos que siguen en uso.
const COLUMNAS = [
    ['publicaciones', 'media_url'],
    ['publicaciones_publicas', 'media_url'],
    ['muro_posts', 'imagen_url'],
    ['muro_videos', 'url_video'],
    ['muro_videos', 'miniatura_url'],
    ['videos', 'url_video'],
    ['videos', 'url_miniatura'],
    ['grupos_video', 'avatar_url'],
    ['grupos_video', 'portada_url'],
    ['grupos_video_publicaciones', 'imagen_url'],
    ['grupos_video_publicaciones', 'video_url'],
    ['grupos_video_publicaciones', 'miniatura_url'],
    ['estados', 'media_url'],
    ['estados', 'imagen_url'],
    ['mensajes_chat', 'imagen_url'],
    ['usuarios', 'avatar_url'],
    ['usuarios', 'portada_url'],
    ['perfil_usuario', 'avatar_url'],
    ['perfil_usuario', 'portada_url'],
    ['ai_voice_chats', 'audio_bot_url'],
    ['ai_voice_chats', 'audio_usuario_url'],
    ['ai_voice_chats_maiz', 'audio_bot_url'],
    ['ai_voice_chats_maiz', 'audio_usuario_url'],
    ['itlasuhua_chats', 'audio_bot_url'],
    ['itlasuhua_chats', 'audio_usuario_url']
];

// Busca la ruta del archivo dentro de la columna, sin importar si la URL
// trae parámetros al final (por ejemplo, ?t=...).
async function estaReferenciado(bucket, path) {
    const patron = `%${bucket}/${path}%`;

    for (const [tabla, columna] of COLUMNAS) {
        const { count, error } = await admin
            .from(tabla)
            .select('*', { count: 'exact', head: true })
            .like(columna, patron);

        if (error) {
            throw new Error(`Verificación fallida en ${tabla}.${columna}: ${error.message}`);
        }
        if (count > 0) return true;
    }
    return false;
}

(async () => {
    if (!ARCHIVO) {
        console.error('Falta el archivo JSON. Ejemplo: node scripts/limpieza-storage.js candidatos-19.json');
        process.exit(1);
    }

    const candidatos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    const ahora = Date.now();
    const aBorrar = [];

    console.log(`Revisando ${candidatos.length} candidatos...\n`);

    for (const c of candidatos) {
        if (ahora - new Date(c.created_at).getTime() < GRACIA_MS) {
            console.log(`OMITIDO (menos de 24 h): ${c.bucket}/${c.path}`);
            continue;
        }
        if (await estaReferenciado(c.bucket, c.path)) {
            console.log(`OMITIDO (en uso): ${c.bucket}/${c.path}`);
            continue;
        }
        aBorrar.push(c);
    }

    console.log(`\nPor borrar: ${aBorrar.length} de ${candidatos.length}`);

    if (!CONFIRMAR) {
        console.log('Simulación: no se borró nada. Ejecuta con --confirm para borrar.');
        return;
    }

    for (const bucket of [...new Set(aBorrar.map(c => c.bucket))]) {
        const paths = aBorrar.filter(c => c.bucket === bucket).map(c => c.path);

        for (let i = 0; i < paths.length; i += 100) {
            const lote = paths.slice(i, i + 100);

            const { error } = await admin.storage.from(bucket).remove(lote);
            if (error) throw error;

            const { error: errHash } = await admin
                .from('archivos_hash')
                .delete()
                .eq('bucket', bucket)
                .in('path', lote);
            if (errHash) console.warn(`Aviso: no se limpió archivos_hash para ${bucket}: ${errHash.message}`);

            console.log(`Borrados ${lote.length} en ${bucket}`);
        }
    }

    console.log('\nListo.');
})().catch((err) => {
    console.error('ERROR. Revisa el mensaje y vuelve a intentar: no se borró nada más.', err.message);
    process.exit(1);
});