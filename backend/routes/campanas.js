// ================================================================
// routes/campanas.js — Creación de campañas v4.0
// Endpoint: POST /api/campanas/crear
//
// REGLA: una campaña solo queda guardada si su pago se genera en
// NOWPayments. Si cualquier paso falla (validación, base de datos o
// NOWPayments), todo lo insertado se revierte. No hay campañas
// huérfanas ni presupuestos falsos en el panel.
//
// Flujo:
//   1. Validar campos, destino, red de pago y contenido (media aceptada).
//   2. Insertar campaña, anuncio, destino y vincular el contenido.
//   3. Insertar el pago pendiente y crear el pago en NOWPayments.
//   4. Si todo sale bien: responder con la dirección y el monto a pagar.
//      Si algo falla: revertir y responder error (el usuario puede reintentar).
//
// La activación y la publicación del creativo NO ocurren aquí: solo al
// confirmarse el pago (webhook o polling) en confirmar-pago-campana.js.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');
const { REDES_PERMITIDAS, MXN_A_USD_APROX } = require('../config/redes-pago');
const { crearPagoNowPayments } = require('../services/marketing/pago-campana');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const OBJETIVOS = ['alcance', 'reproducciones', 'interacciones', 'clics'];
const DESTINOS = ['live', 'grupo', 'video'];
const FEED_VIDEO = '__feed__';
const MAX_MXN = 1000000;
const MAX_PENDIENTES = 10;
const DIAS_CAMPANA = 30;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Mínimo en USD de la red (fuente única: config/redes-pago.js)
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
    return { valido: true };
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
        const { data, error } = await supabaseAdmin
            .from('transmisiones').select('id')
            .eq('id', destinoRef).eq('estado', 'en_vivo').eq('is_live', true)
            .maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'El live no está en vivo' };
        return { ok: true };
    }

    if (destinoTipo === 'grupo') {
        const { data, error } = await supabaseAdmin
            .from('grupos_video').select('id').eq('id', destinoRef).maybeSingle();
        if (error) return { error: 'Error verificando el destino', interno: error.message };
        if (!data) return { error: 'Grupo no encontrado' };
        return { ok: true };
    }

    const { data, error } = await supabaseAdmin
        .from('videos').select('id').eq('id', destinoRef).maybeSingle();
    if (error) return { error: 'Error verificando el destino', interno: error.message };
    if (!data) return { error: 'Video no encontrado' };
    return { ok: true };
}

// El contenido de Promi debe estar aceptado, ser del usuario y no estar usado
async function validarMedia(mediaId, userId) {
    const { data: m, error } = await supabaseAdmin
        .from('ai_media_borradores')
        .select('id, usuario_id, estado, campaign_id')
        .eq('id', mediaId)
        .maybeSingle();
    if (error) return { error: 'Error validando el contenido', status: 500 };
    if (!m || m.usuario_id !== userId) return { error: 'Contenido no encontrado', status: 404 };
    if (m.estado !== 'aceptada') return { error: 'El contenido debe estar aceptado antes de usarlo', status: 400 };
    if (m.campaign_id) return { error: 'Este contenido ya está en otra campaña', status: 409 };
    return { ok: true };
}

// Revierte todo lo insertado para esta campaña (orden por dependencias).
// La vinculación del contenido se libera sola: ON DELETE SET NULL.
function crearLimpieza(campaignId) {
    return async () => {
        const tablas = ['marketing_pagos', 'marketing_campaign_targets', 'marketing_ads'];
        for (const tabla of tablas) {
            const { error } = await supabaseAdmin.from(tabla).delete().eq('campaign_id', campaignId);
            if (error) logger.error(`campanas limpiar ${tabla} ${campaignId}: ${error.message}`);
        }
        const { error } = await supabaseAdmin.from('marketing_campaigns').delete().eq('id', campaignId);
        if (error) logger.error(`campanas limpiar campaña ${campaignId}: ${error.message}`);
    };
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
        const payCurrency = String(b.pay_currency || '').trim().toLowerCase();
        const mediaId = b.media_id ? String(b.media_id).trim() : null;

        const titulo = String(ad.titulo || '').trim().slice(0, 150);
        const descripcion = String(ad.descripcion || '').trim().slice(0, 500) || null;
        const cta = String(ad.cta_texto || 'Ver más').trim().slice(0, 40);

        // Con contenido de Promi, las URLs manuales se ignoran
        const imagenManual = !mediaId && ad.imagen_url ? urlSegura(ad.imagen_url) : null;
        const videoManual = !mediaId && ad.video_url ? urlSegura(ad.video_url) : null;

        // ---------- Validaciones (sin tocar la base) ----------
        if (!nombre) return respuestaError(res, 400, 'Nombre requerido');
        if (!OBJETIVOS.includes(objetivo)) return respuestaError(res, 400, 'Objetivo inválido');
        if (!Number.isFinite(presupuesto) || presupuesto <= 0 || presupuesto > MAX_MXN) {
            return respuestaError(res, 400, 'Presupuesto inválido');
        }
        if (!DESTINOS.includes(destinoTipo)) return respuestaError(res, 400, 'Tipo de destino inválido');
        if (!destinoIdRaw) return respuestaError(res, 400, 'Destino requerido');
        if (!titulo) return respuestaError(res, 400, 'Título requerido');

        if (!mediaId) {
            if (ad.imagen_url && !imagenManual) return respuestaError(res, 400, 'URL de imagen inválida');
            if (ad.video_url && !videoManual) return respuestaError(res, 400, 'URL de video inválida');
            if (!imagenManual && !videoManual) {
                return respuestaError(res, 400, 'Debes incluir una imagen, un video o contenido de Promi');
            }
        } else if (!UUID_REGEX.test(mediaId)) {
            return respuestaError(res, 400, 'media_id inválido');
        }

        if (!REDES_PERMITIDAS[payCurrency]) return respuestaError(res, 400, 'Red de pago no soportada');
        const validacionRed = validarRedPago(payCurrency, presupuesto);
        if (!validacionRed.valido) return respuestaError(res, 400, validacionRed.error);

        const destino = parsearDestino(destinoTipo, destinoIdRaw);
        if (destino.error) return respuestaError(res, 400, destino.error);
        const destinoRef = destino.ref;

        if (mediaId) {
            const vm = await validarMedia(mediaId, userId);
            if (vm.error) return respuestaError(res, vm.status, vm.error);
        }

        const { count: pendientes, error: errPend } = await supabaseAdmin
            .from('marketing_campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('anunciante_id', userId)
            .eq('estado', 'pendiente_pago');
        if (errPend) return respuestaError(res, 500, 'Error interno');
        if ((pendientes || 0) >= MAX_PENDIENTES) {
            return respuestaError(res, 429, 'Tienes demasiadas campañas sin pagar. Completa o cancela alguna antes de crear otra.');
        }

        const verif = await verificarDestino(destinoTipo, destinoRef);
        if (verif.error) return respuestaError(res, verif.interno ? 500 : 400, verif.error);

        // ---------- Inserciones (todo se revierte si algo falla) ----------
        const ahora = Date.now();
        const { data: camp, error: eCamp } = await supabaseAdmin
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
        if (eCamp || !camp) {
            logger.error(`campanas/crear campaña: ${eCamp?.message || 'sin datos'}`);
            return respuestaError(res, 500, 'No se pudo crear la campaña');
        }

        const campaignId = camp.id;
        const limpiar = crearLimpieza(campaignId);

        const { error: eAd } = await supabaseAdmin
            .from('marketing_ads')
            .insert({
                campaign_id: campaignId,
                titulo,
                descripcion,
                imagen_url: imagenManual,
                video_url: videoManual,
                media_id: mediaId,
                cta_texto: cta,
                destino_tipo: destinoTipo,
                destino_live_id: destinoTipo === 'live' ? destinoRef : null,
                destino_grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
                destino_video_id: destinoTipo === 'video' ? destinoRef : null,
                activo: true
            });
        if (eAd) {
            logger.error(`campanas/crear anuncio: ${eAd.message}`);
            await limpiar();
            return respuestaError(res, 500, 'No se pudo crear el anuncio');
        }

        const { error: eTarget } = await supabaseAdmin
            .from('marketing_campaign_targets')
            .insert({
                campaign_id: campaignId,
                target_tipo: destinoTipo,
                live_id: destinoTipo === 'live' ? destinoRef : null,
                grupo_id: destinoTipo === 'grupo' ? destinoRef : null,
                video_id: destinoTipo === 'video' ? destinoRef : null
            });
        if (eTarget) {
            logger.error(`campanas/crear destino: ${eTarget.message}`);
            await limpiar();
            return respuestaError(res, 500, 'No se pudo crear el destino');
        }

        // Vincular el contenido solo si sigue libre (evita usarlo en dos campañas)
        if (mediaId) {
            const { data: vinculado, error: eVinc } = await supabaseAdmin
                .from('ai_media_borradores')
                .update({ campaign_id: campaignId, updated_at: new Date().toISOString() })
                .eq('id', mediaId)
                .eq('usuario_id', userId)
                .eq('estado', 'aceptada')
                .is('campaign_id', null)
                .select('id')
                .maybeSingle();
            if (eVinc || !vinculado) {
                await limpiar();
                return respuestaError(res, 409, 'Este contenido ya no está disponible. Vuelve a generarlo o elige otro.');
            }
        }

        const { data: pago, error: ePago } = await supabaseAdmin
            .from('marketing_pagos')
            .insert({
                campaign_id: campaignId,
                anunciante_id: userId,
                monto_mxn: presupuesto,
                estado: 'pendiente',
                pay_currency: payCurrency
            })
            .select('id')
            .single();
        if (ePago || !pago) {
            logger.error(`campanas/crear pago: ${ePago?.message || 'sin datos'}`);
            await limpiar();
            return respuestaError(res, 500, 'No se pudo preparar el pago. Intenta de nuevo.');
        }

        // ---------- Pago en NOWPayments: si falla, no queda nada guardado ----------
        let np;
        try {
            np = await crearPagoNowPayments({
                pagoId: pago.id,
                payCurrency,
                montoMxn: presupuesto,
                descripcion: `Campaña de marketing: ${nombre}`
            });
        } catch (e) {
            logger.error(`campanas/crear NOWPayments (${e.codigo || 'desconocido'}): ${JSON.stringify(e.detalle || e.message)}`);
            await limpiar();
            return respuestaError(res, 502, 'No se pudo generar el pago. Tu campaña no se guardó; intenta de nuevo.');
        }

        const { error: eDatos } = await supabaseAdmin
            .from('marketing_pagos')
            .update({
                payment_id: np.payment_id,
                precio_usdt: np.pay_amount,
                moneda_pago: np.pay_currency,
                nowpayments_status: np.payment_status
            })
            .eq('id', pago.id);
        if (eDatos) {
            logger.error(`campanas/crear guardar pago ${pago.id}: ${eDatos.message}`);
            await limpiar();
            return respuestaError(res, 500, 'No se pudo guardar el pago. Intenta de nuevo.');
        }

        logger.info(`Campaña ${campaignId} creada con pago ${pago.id} (anunciante ${userId})`);

        return res.status(201).json({
            success: true,
            data: {
                campaign_id: campaignId,
                estado: 'pendiente_pago',
                presupuesto,
                moneda: 'MXN',
                pago: {
                    pago_id: pago.id,
                    payment_id: np.payment_id,
                    order_id: np.orderId,
                    pay_address: np.pay_address,
                    pay_amount: np.pay_amount,
                    pay_currency: np.pay_currency,
                    monto_mxn: presupuesto
                }
            }
        });
    } catch (error) {
        logger.error(`campanas/crear: ${error.message}`);
        return respuestaError(res, 500, 'Error interno creando la campaña');
    }
});

module.exports = router;
