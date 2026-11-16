// ================================================================
// services/marketing/publicar-media.js — Csariel's
// Copia el creativo aceptado (borrador privado) a una ruta pública
// de R2 y guarda la URL pública en marketing_ads.
//
// Idempotente: si el archivo ya fue copiado, reutiliza la misma key
// (la copia se sobrescribe con el mismo contenido) y solo asegura la URL.
// Errores permanentes (media descartada o no aceptada) se marcan con
// .permanente = true para que el llamador mande el pago a revisión
// en lugar de reintentar para siempre.
// ================================================================

'use strict';

const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { supabaseAdmin } = require('../../config/supabase');

const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

const EXTENSION = { imagen: 'jpg', video: 'mp4' };
const MIME = { imagen: 'image/jpeg', video: 'video/mp4' };

function errorPermanente(mensaje) {
    const e = new Error(mensaje);
    e.permanente = true;
    return e;
}

async function publicarMediaDeCampana(campaignId) {
    if (!R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL no configurada');

    const { data: ads, error: errAds } = await supabaseAdmin
        .from('marketing_ads')
        .select('id, media_id, imagen_url, video_url')
        .eq('campaign_id', campaignId)
        .not('media_id', 'is', null);
    if (errAds) throw new Error(`db ads: ${errAds.message}`);

    for (const ad of ads || []) {
        const { data: media, error: errMedia } = await supabaseAdmin
            .from('ai_media_borradores')
            .select('id, tipo, estado, storage_key, public_key')
            .eq('id', ad.media_id)
            .maybeSingle();
        if (errMedia) throw new Error(`db media: ${errMedia.message}`);

        if (!media || media.estado !== 'aceptada' || !media.storage_key) {
            throw errorPermanente(`media ${ad.media_id} no disponible para publicar`);
        }

        const campo = media.tipo === 'video' ? 'video_url' : 'imagen_url';
        const keyPublica = media.public_key
            || `marketing/anuncios/${campaignId}/${media.id}.${EXTENSION[media.tipo]}`;

        if (!media.public_key) {
            await s3.send(new CopyObjectCommand({
                Bucket: R2_BUCKET,
                CopySource: `${R2_BUCKET}/${encodeURI(media.storage_key)}`,
                Key: keyPublica,
                ContentType: MIME[media.tipo],
                MetadataDirective: 'REPLACE',
                CacheControl: 'public, max-age=86400'
            }));

            const { error: errUp } = await supabaseAdmin
                .from('ai_media_borradores')
                .update({ public_key: keyPublica, publicada_at: new Date().toISOString() })
                .eq('id', media.id);
            if (errUp) throw new Error(`db update media: ${errUp.message}`);
        }

        const url = `${R2_PUBLIC_URL}/${keyPublica}`;
        if (ad[campo] !== url) {
            const { error: errAd } = await supabaseAdmin
                .from('marketing_ads')
                .update({ [campo]: url })
                .eq('id', ad.id);
            if (errAd) throw new Error(`db update ad: ${errAd.message}`);
        }
    }

    return { anuncios: (ads || []).length };
}

module.exports = { publicarMediaDeCampana };
