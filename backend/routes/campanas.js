// ================================================================
// routes/campanas.js — Campañas de marketing (creación segura) v2
// Endpoint: POST /api/campanas/crear
//
// Destinos soportados:
//   live   → transmisiones.id (integer), debe estar en vivo
//   grupo  → grupos_video.id (uuid)
//   video  → videos.id (uuid), o '__feed__' para todo el feed de videos
//
// Dependencias validadas:
//   middleware/auth.js      → verificarToken (req.usuario)
//   middleware/rateLimit.js → limitadorPagos (por usuario)
//
// El backend:
//   1. Valida campos (nombre, objetivo, presupuesto, destino, anuncio, red de pago).
//   2. Verifica que el destino exista (y esté en vivo si es live).
//   3. Inserta campaña, anuncio y destino; si algo falla, revierte todo.
//   4. Devuelve campaign_id. El pago se pide después en
//      POST /api/payments/marketing/create.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

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

// Mismo valor que routes/payments.js. Mantener sincronizado.
const MXN_A_USD_APROX = 0.055;

// Mínimos por red. Debe coincidir con REDES_PERMITIDAS de routes/payments.js.
// Fuente única compartida con routes/payments.js (ver config/redes-pago.js)
const { REDES_PERMITIDAS } = require('../config/redes-pago');

const MAX_MXN = 1000000;
const MAX_PENDIENTES = 10;
const DIAS_CAMPANA = 30;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ================================================================
// HELPERS
// ================================================================

const respuestaError = (res, status, error) => res.status(status).json({ success: false, error });

// URL http/https válida o null
function urlSegura(valor) {
    if (!valor || typeof valor !== 'string') return null;
    try {
        const u = new URL(valor.trim());
        return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
    } catch {
        return null;
    }
}

// La red debe existir y el monto debe alcanzar su mínimo en USD
function validarRedPago(payCurrency, montoMxn) {
    const red = REDES_PERMITIDAS[payCurrency];
    if (!red) return { valido: false, error: 'Red de pago no soportada' };

    const montoUsd = Number(montoMxn) * MXN_A_USD_APROX;
    if (montoUsd < red.minimo_usd) {
        const minimoMxn = Math.ceil(red.minimo_usd / MXN_A_USD_APROX);
        return {
            valido: false,
            error: `El monto es demasiado bajo para ${red.moneda} en ${red.red}. Mínimo: ${red.minimo_usd} USD (~$${minimoMxn} MXN)`
        };
    }
    return { valido: true, red };
}

// Convierte el destino recibido en la referencia que espera cada tabla.
// Devuelve { error } o { ref } donde ref es null para el feed de videos.
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
    // video
    if (destinoIdRaw === FEED_VIDEO) return { ref: null };
    if (!UUID_REGEX.test(destinoIdRaw)) return { error: 'ID de video inválido' };
    return { ref: destinoIdRaw };
}

// Verifica que el destino exista y, si es live, que esté en vivo
async function verificarDestino(destinoTipo, destinoRef) {
    if (destinoTipo === 'video' && destinoRef === null) return { ok: true };

    if (destinoTipo === 'live') {
        const { data, error } = await supabaseAdmin
            .from('transmisiones')
            .select('id')
            .eq('id', destinoRef)
            .eq('estado', 'en_vivo')
            .eq('is_live', true)
            .maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'El live no está en vivo' };
        return { ok: true };
    }

    if (destinoTipo === 'grupo') {
        const { data, error } = await supabaseAdmin
            .from('grupos_video')
            .select('id')
            .eq('id', destinoRef)
            .maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'Grupo no encontrado' };
        return { ok: true };
    }

    // video (uno específico)
    const { data, error } = await supabaseAdmin
        .from('videos')
        .select('id')
        .eq('id', destinoRef)
        .maybeSingle();
    if (error) return { error: 'Error verificando el destino', interno: error.message };
    if (!data) return { error: 'Video no encontrado' };
    return { ok: true };
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

        // ---------- Normalización ----------
        const nombre = String(b.nombre || '').trim().slice(0, 120);
        const objetivo = String(b.objetivo || '').trim();
        const presupuesto = Number(b.presupuesto);
        const destinoTipo = String(b.destino_tipo || '').trim();
        const destinoIdRaw = String(b.destino_id || '').trim();
        const payCurrency = String(b.pay_currency || 'usdttrc20').trim().toLowerCase();

        const titulo = String(ad.titulo || '').trim().slice(0, 150);
        const descripcion = String(ad.descripcion || '').trim().slice(0, 500) || null;
        const cta = String(ad.cta_texto || 'Ver más').trim().slice(0, 40);
        const imagen = ad.imagen_url ? urlSegura(ad.imagen_url) : null;
        const video = ad.video_url ? urlSegura(ad.video_url) : null;

        // ---------- Validaciones ----------
        if (!nombre) return respuestaError(res, 400, 'Nombre requerido');
        if (!OBJETIVOS.includes(objetivo)) return respuestaError(res, 400, 'Objetivo inválido');
        if (!Number.isFinite(presupuesto) || presupuesto <= 0 || presupuesto > MAX_MXN) {
            return respuestaError(res, 400, 'Presupuesto inválido');
        }
        if (!DESTINOS.includes(destinoTipo)) return respuestaError(res, 400, 'Tipo de destino inválido');
        if (!destinoIdRaw) return respuestaError(res, 400, 'Destino requerido');
        if (!titulo) return respuestaError(res, 400, 'Título requerido');
        if (ad.imagen_url && !imagen) return respuestaError(res, 400, 'URL de imagen inválida');
        if (ad.video_url && !video) return respuestaError(res, 400, 'URL de video inválida');

        const validacionRed = validarRedPago(payCurrency, presupuesto);
        if (!validacionRed.valido) return respuestaError(res, 400, validacionRed.error);

        const destino = parsearDestino(destinoTipo, destinoIdRaw);
        if (destino.error) return respuestaError(res, 400, destino.error);
        const destinoRef = destino.ref; // null solo para el feed de videos

        // ---------- Límite de campañas sin pagar ----------
        const { count: pendientes, error: errCount } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('anunciante_id', userId)
            .eq('estado', 'pendiente_pago');

        if (errCount) {
            logger.error(`campanas/crear conteo: ${errCount.message}`);
            return respuestaError(res, 500, 'Error interno');
        }
        if ((pendientes || 0) >= MAX_PENDIENTES) {
            return respuestaError(res, 429,
                'Tienes demasiadas campañas sin pagar. Completa o cancela alguna antes de crear otra.');
        }

        // ---------- Destino existente (y en vivo si es live) ----------
        const verif = await verificarDestino(destinoTipo, destinoRef);
        if (verif.error) {
            if (verif.interno) logger.error(`campanas/crear destino ${destinoTipo}: ${verif.interno}`);
            const status = verif.interno ? 500 : 400;
            return respuestaError(res, status, verif.error);
        }

        // ---------- Insert 1: campaña ----------
        const ahora = Date.now();
        const { data: camp, error: e1 } = await supabaseAdmin
            .from('marketing_campaigns')
            .insert({
                anunciante_id: userId,
                nombre,
                objetivo,
                presupuesto,
                moneda: 'MXN',
                estado: 'pendiente_pago',
                fecha_inicio: new Date(ahora).toISOString(),
                fecha_fin: new Date(ahora + DIAS_CAMPANA * 86400000).toISOString()
            })
            .select('id')
            .single();

        if (e1 || !camp) {
            logger.error(`campanas/crear campaña: ${e1?.message || 'sin datos'}`);
            return respuestaError(res, 500, 'No se pudo crear la campaña');
        }

        const campaignId = camp.id;

        // Revierte todo lo insertado si un paso posterior falla
        const revertir = async () => {
            try {
                await supabaseAdmin.from('marketing_campaign_targets').delete().eq('campaign_id', campaignId);
                await supabaseAdmin.from('marketing_ads').delete().eq('campaign_id', campaignId);
                await supabaseAdmin.from('marketing_campaigns').delete().eq('id', campaignId);
            } catch (e) {
                logger.error(`campanas/crear rollback: ${e.message}`);
            }
        };

        // ---------- Insert 2: anuncio ----------
        const { error: e2 } = await supabaseAdmin
            .from('marketing_ads')
            .insert({
                campaign_id: campaignId,
                titulo,
                descripcion,
                imagen_url: imagen,
                video_url: video,
                cta_texto: cta,
                destino_tipo: destinoTipo,
                destino_live_id: destinoTipo === 'live' ? destinoRef : null,
                destino_grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
                destino_video_id: destinoTipo === 'video' ? destinoRef : null,
                activo: true
            });

        if (e2) {
            logger.error(`campanas/crear anuncio: ${e2.message}`);
            await revertir();
            return respuestaError(res, 500, 'No se pudo crear el anuncio');
        }

        // ---------- Insert 3: destino de la campaña ----------
        const { error: e3 } = await supabaseAdmin
            .from('marketing_campaign_targets')
            .insert({
                campaign_id: campaignId,
                target_tipo: destinoTipo,
                live_id: destinoTipo === 'live' ? destinoRef : null,
                grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
                video_id: destinoTipo === 'video' ? destinoRef : null
            });

        if (e3) {
            logger.error(`campanas/crear target: ${e3.message}`);
            await revertir();
            return respuestaError(res, 500, 'No se pudo crear el destino de la campaña');
        }

        logger.info(`Campaña creada: ${campaignId} (anunciante ${userId}, destino ${destinoTipo})`);

        return res.status(201).json({
            success: true,
            data: {
                campaign_id: campaignId,
                estado: 'pendiente_pago',
                presupuesto,
                moneda: 'MXN'
            }
        });
    } catch (error) {
        logger.error(`campanas/crear: ${error.message}`);
        return respuestaError(res, 500, 'Error interno creando la campaña');
    }
});

module.exports = router;
