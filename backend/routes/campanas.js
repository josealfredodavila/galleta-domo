// ================================================================
// routes/campanas.js — Campañas de marketing (creación segura) v3.0
// Endpoint: POST /api/campanas/crear
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();
const { CopyObjectCommand } = require('@aws-sdk/client-s3'); // <- NUEVO

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const OBJETIVOS = ['alcance', 'reproducciones', 'interacciones', 'clics'];
const DESTINOS = ['live', 'grupo', 'video'];
const FEED_VIDEO = '__feed__';
const MXN_A_USD_APROX = 0.055;
const { REDES_PERMITIDAS } = require('../config/redes-pago');

const MAX_MXN = 1000000;
const MAX_PENDIENTES = 10;
const DIAS_CAMPANA = 30;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cliente R2 para copiar archivos
const { S3Client } = require('@aws-sdk/client-s3');
const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});
const R2_BUCKET = process.env.R2_BUCKET || 'csariels-media';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ================================================================
// HELPERS
// ================================================================

const respuestaError = (res, status, error) => res.status(status).json({ success: false, error });

function urlSegura(valor) {
    if (!valor || typeof valor !== 'string') return null;
    try {
        const u = new URL(valor.trim());
        return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
    } catch {
        return null;
    }
}

function validarRedPago(payCurrency, montoMxn) {
    const red = REDES_PERMITIDAS[payCurrency];
    if (!red) return { valido: false, error: 'Red de pago no soportada' };

    const montoUsd = Number(montoMxn) * MXN_A_USD_APROX;
    if (montoUsd < red.minimo_usd) {
        const minimoMxn = Math.ceil(red.minimo_usd / MXN_A_USD_APROX);
        return { valido: false, error: `El monto es demasiado bajo para ${red.moneda}. Mínimo: ${red.minimo_usd} USD (~$${minimoMxn} MXN)` };
    }
    return { valido: true, red };
}

function parsearDestino(destinoTipo, destinoIdRaw) {
    if (destinoTipo === 'live') {
        const n = Number(destinoIdRaw);
        if (!Number.isInteger(n) || n <= 0) return { error: 'ID de live inválido' };
        return { ref: n };
    }
    if (destinoTipo === 'grupo') {
        if (!UUID_REGEX.test(destinoIdRaw)) return { error: 'ID de grupo inválido' };
        return { ref: destinoIdRaw };
    }
    if (destinoIdRaw === FEED_VIDEO) return { ref: null };
    if (!UUID_REGEX.test(destinoIdRaw)) return { error: 'ID de video inválido' };
    return { ref: destinoIdRaw };
}

async function verificarDestino(destinoTipo, destinoRef) {
    if (destinoTipo === 'video' && destinoRef === null) return { ok: true };
    if (destinoTipo === 'live') {
        const { data, error } = await supabaseAdmin.from('transmisiones').select('id').eq('id', destinoRef).eq('estado', 'en_vivo').eq('is_live', true).maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'El live no está en vivo' };
        return { ok: true };
    }
    if (destinoTipo === 'grupo') {
        const { data, error } = await supabaseAdmin.from('grupos_video').select('id').eq('id', destinoRef).maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'Grupo no encontrado' };
        return { ok: true };
    }
    const { data, error } = await supabaseAdmin.from('videos').select('id').eq('id', destinoRef).maybeSingle();
    if (error) return { error: 'Error verificando el destino', interno: error.message };
    if (!data) return { error: 'Video no encontrado' };
    return { ok: true };
}

// ================================================================
// PUBLICAR MEDIA EN R2 (Se llamará desde el webhook)
// ================================================================
async function publicarMediaDeCampana(campaignId) {
    const { data: ad, error: errAd } = await supabaseAdmin.from('marketing_ads').select('id, media_id, imagen_url, video_url').eq('campaign_id', campaignId).maybeSingle();
    if (errAd) throw new Error(`DB Error: ${errAd.message}`);
    if (!ad || !ad.media_id) return { publicado: false, razon: 'sin media_id' };

    const { data: media } = await supabaseAdmin.from('ai_media_borradores').select('tipo, storage_key').eq('id', ad.media_id).maybeSingle();
    if (!media || !media.storage_key) throw new Error('Media no encontrada en DB');

    const campoDestino = media.tipo === 'video' ? 'video_url' : 'imagen_url';
    if (ad[campoDestino]) return { publicado: false, razon: 'ya publicado', url: ad[campoDestino] };

    const ext = media.storage_key.split('.').pop() || (media.tipo === 'video' ? 'mp4' : 'jpg');
    const keyPublica = `marketing/anuncios/${campaignId}/${media.id}.${ext}`;

    await s3.send(new CopyObjectCommand({
        Bucket: R2_BUCKET,
        CopySource: `${R2_BUCKET}/${media.storage_key}`,
        Key: keyPublica
    }));

    const urlPublica = `${R2_PUBLIC_URL}/${keyPublica}`;
    await supabaseAdmin.from('marketing_ads').update({ [campoDestino]: urlPublica }).eq('id', ad.id);

    return { publicado: true, url: urlPublica, tipo: media.tipo };
}

// ================================================================
// POST /api/campanas/crear
// ================================================================
router.post('/crear', verificarToken, limitadorPagos, async (req, res) => {
    const userId = req.usuario?.id;
    if (!userId) return respuestaError(res, 401, 'No autenticado');

    try {
        const b = req.body || {};
        const ad = b.ad || {};

        const nombre = String(b.nombre || '').trim().slice(0, 120);
        const objetivo = String(b.objetivo || '').trim();
        const presupuesto = Number(b.presupuesto);
        const destinoTipo = String(b.destino_tipo || '').trim();
        const destinoIdRaw = String(b.destino_id || '').trim();
        const payCurrency = String(b.pay_currency || 'usdttrc20').trim().toLowerCase();
        const mediaId = b.media_id ? String(b.media_id).trim() : null;

        const titulo = String(ad.titulo || '').trim().slice(0, 150);
        const descripcion = String(ad.descripcion || '').trim().slice(0, 500) || null;
        const cta = String(ad.cta_texto || 'Ver más').trim().slice(0, 40);
        
        // Si hay media IA, ignoramos las URLs manuales
        const imagen = !mediaId && ad.imagen_url ? urlSegura(ad.imagen_url) : null;
        const video = !mediaId && ad.video_url ? urlSegura(ad.video_url) : null;

        if (!nombre) return respuestaError(res, 400, 'Nombre requerido');
        if (!OBJETIVOS.includes(objetivo)) return respuestaError(res, 400, 'Objetivo inválido');
        if (!Number.isFinite(presupuesto) || presupuesto <= 0 || presupuesto > MAX_MXN) return respuestaError(res, 400, 'Presupuesto inválido');
        if (!DESTINOS.includes(destinoTipo)) return respuestaError(res, 400, 'Tipo de destino inválido');
        if (!destinoIdRaw) return respuestaError(res, 400, 'Destino requerido');
        if (!titulo) return respuestaError(res, 400, 'Título requerido');
        
        if (!mediaId) {
            if (ad.imagen_url && !imagen) return respuestaError(res, 400, 'URL de imagen inválida');
            if (ad.video_url && !video) return respuestaError(res, 400, 'URL de video inválida');
            if (!imagen && !video) return respuestaError(res, 400, 'Debes incluir una imagen, video o media IA');
        }

        const validacionRed = validarRedPago(payCurrency, presupuesto);
        if (!validacionRed.valido) return respuestaError(res, 400, validacionRed.error);

        const destino = parsearDestino(destinoTipo, destinoIdRaw);
        if (destino.error) return respuestaError(res, 400, destino.error);
        const destinoRef = destino.ref;

        // Validar Media IA si se envió
        if (mediaId) {
            if (!UUID_REGEX.test(mediaId)) return respuestaError(res, 400, 'media_id inválido');
            const { data: mediaDb } = await supabaseAdmin.from('ai_media_borradores').select('usuario_id, estado').eq('id', mediaId).maybeSingle();
            if (!mediaDb) return respuestaError(res, 404, 'Media no encontrada');
            if (mediaDb.usuario_id !== userId) return respuestaError(res, 403, 'La media no te pertenece');
            if (mediaDb.estado !== 'aceptada') return respuestaError(res, 400, 'La media no ha sido aceptada');
        }

        const { count: pendientes } = await supabaseAdmin.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('anunciante_id', userId).eq('estado', 'pendiente_pago');
        if ((pendientes || 0) >= MAX_PENDIENTES) return respuestaError(res, 429, 'Tienes demasiadas campañas sin pagar');

        const verif = await verificarDestino(destinoTipo, destinoRef);
        if (verif.error) return respuestaError(res, verif.interno ? 500 : 400, verif.error);

        const ahora = Date.now();
        const { data: camp, error: e1 } = await supabaseAdmin.from('marketing_campaigns').insert({
            anunciante_id: userId,
            nombre, objetivo, presupuesto, moneda: 'MXN', estado: 'pendiente_pago',
            fecha_inicio: new Date(ahora).toISOString(),
            fecha_fin: new Date(ahora + DIAS_CAMPANA * 86400000).toISOString()
        }).select('id').single();

        if (e1 || !camp) return respuestaError(res, 500, 'No se pudo crear la campaña');
        const campaignId = camp.id;

        const revertir = async () => {
            await supabaseAdmin.from('marketing_campaign_targets').delete().eq('campaign_id', campaignId);
            await supabaseAdmin.from('marketing_ads').delete().eq('campaign_id', campaignId);
            await supabaseAdmin.from('marketing_campaigns').delete().eq('id', campaignId);
        };

        const { error: e2 } = await supabaseAdmin.from('marketing_ads').insert({
            campaign_id: campaignId,
            titulo, descripcion,
            imagen_url: imagen,
            video_url: video,
            media_id: mediaId, // <- Guardamos la referencia IA
            cta_texto: cta,
            destino_tipo: destinoTipo,
            destino_live_id: destinoTipo === 'live' ? destinoRef : null,
            destino_grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
            destino_video_id: destinoTipo === 'video' ? destinoRef : null,
            activo: true
        });

        if (e2) { await revertir(); return respuestaError(res, 500, 'No se pudo crear el anuncio'); }

        const { error: e3 } = await supabaseAdmin.from('marketing_campaign_targets').insert({
            campaign_id: campaignId,
            target_tipo: destinoTipo,
            live_id: destinoTipo === 'live' ? destinoRef : null,
            grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
            video_id: destinoTipo === 'video' ? destinoRef : null
        });

        if (e3) { await revertir(); return respuestaError(res, 500, 'No se pudo crear el destino'); }

        return res.status(201).json({
            success: true,
            data: { campaign_id: campaignId, estado: 'pendiente_pago', presupuesto, moneda: 'MXN' }
        });
    } catch (error) {
        logger.error(`campanas/crear: ${error.message}`);
        return respuestaError(res, 500, 'Error interno creando la campaña');
    }
});

// Exportamos la función para que el webhook la use al confirmar el pago
router.publicarMediaDeCampana = publicarMediaDeCampana;
module.exports = router;