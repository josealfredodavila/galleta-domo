// ================================================================
// routes/campanas.js — Campañas de marketing (creación segura)
// Endpoint: POST /api/campanas/crear
//
// El frontend envía los datos aquí. El backend:
//   1. Valida campos (nombre, objetivo, presupuesto, destino, anuncio, red de pago).
//   2. Verifica que el destino exista y esté en vivo (live) o exista (grupo).
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
const DESTINOS = ['live', 'grupo'];

// Mismo valor que routes/payments.js. Mantener sincronizado.
const MXN_A_USD_APROX = 0.055;

// Mínimos por red. Debe coincidir con REDES_PERMITIDAS de routes/payments.js.
const REDES_PERMITIDAS = {
    usdttrc20: { moneda: 'USDT', red: 'TRON',     minimo_usd: 1  },
    usdtbsc:   { moneda: 'USDT', red: 'BSC',      minimo_usd: 1  },
    usdtmatic: { moneda: 'USDT', red: 'Polygon',  minimo_usd: 1  },
    usdtsol:   { moneda: 'USDT', red: 'Solana',   minimo_usd: 1  },
    usdterc20: { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },
    usdcsol:   { moneda: 'USDC', red: 'Solana',   minimo_usd: 1  },
    usdcmatic: { moneda: 'USDC', red: 'Polygon',  minimo_usd: 1  },
    usdcbsc:   { moneda: 'USDC', red: 'BSC',      minimo_usd: 1  },
    usdc:      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 }
};

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

        // ---------- Destino: tipo de dato según la tabla ----------
        // live → transmisiones.id (integer); grupo → grupos_video.id (uuid)
        let destinoRef;
        if (destinoTipo === 'live') {
            const n = Number(destinoIdRaw);
            if (!Number.isInteger(n) || n <= 0) return respuestaError(res, 400, 'ID de live inválido');
            destinoRef = n;
        } else {
            if (!UUID_REGEX.test(destinoIdRaw)) return respuestaError(res, 400, 'ID de grupo inválido');
            destinoRef = destinoIdRaw;
        }

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
        let destinoValido;
        if (destinoTipo === 'live') {
            const { data, error } = await supabaseAdmin
                .from('transmisiones')
                .select('id')
                .eq('id', destinoRef)
                .eq('estado', 'en_vivo')
                .eq('is_live', true)
                .maybeSingle();
            if (error) {
                logger.error(`campanas/crear live: ${error.message}`);
                return respuestaError(res, 500, 'Error verificando el destino');
            }
            destinoValido = data;
            if (!destinoValido) return respuestaError(res, 400, 'El live no está en vivo');
        } else {
            const { data, error } = await supabaseAdmin
                .from('grupos_video')
                .select('id')
                .eq('id', destinoRef)
                .maybeSingle();
            if (error) {
                logger.error(`campanas/crear grupo: ${error.message}`);
                return respuestaError(res, 500, 'Error verificando el destino');
            }
            destinoValido = data;
            if (!destinoValido) return respuestaError(res, 400, 'Grupo no encontrado');
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
                grupo_id: destinoTipo === 'grupo' ? destinoRef : null
            });

        if (e3) {
            logger.error(`campanas/crear target: ${e3.message}`);
            await revertir();
            return respuestaError(res, 500, 'No se pudo crear el destino de la campaña');
        }

        logger.info(`Campaña creada: ${campaignId} (anunciante ${userId})`);

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