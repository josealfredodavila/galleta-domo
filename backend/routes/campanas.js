// ================================================================
// routes/campanas.js — Campañas de marketing (creación segura)
// ================================================================
// Endpoint: POST /api/campanas/crear
//
// Reemplaza la creación directa desde el frontend a Supabase.
// El frontend envía los datos aquí, el backend:
//   1. Valida todos los campos (nombre, objetivo, presupuesto, destino, ad).
//   2. Verifica que el destino exista y sea válido según su tipo.
//   3. Inserta campaña + anuncio + target de forma atómica (con rollback).
//   4. Devuelve campaign_id al frontend, que luego pide el pago.
//
// El pago y la activación viven en:
//   POST /api/payments/marketing/create
//   GET  /api/payments/marketing/status/:pagoId
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();

const supabaseAdmin = require('../lib/supabase-admin');
const logger = require('../utils/logger');
const { verificarToken } = require('../middleware/auth');
const { limitadorPagos } = require('../middleware/rateLimit');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const OBJETIVOS = ['alcance', 'reproducciones', 'interacciones', 'clics'];

const DESTINOS = ['live', 'grupo'];

// Mismo valor que routes/payments.js — mantener sincronizado.
const MXN_A_USD_APROX = 0.055;

// Mínimos por red. Debe coincidir con REDES_PERMITIDAS de routes/payments.js.
// Si agregas o cambias una red en payments.js, actualiza aquí también.
const REDES_PERMITIDAS = {
    'usdttrc20': { moneda: 'USDT', red: 'TRON',     minimo_usd: 1  },
    'usdtbsc':   { moneda: 'USDT', red: 'BSC',      minimo_usd: 1  },
    'usdtmatic': { moneda: 'USDT', red: 'Polygon',  minimo_usd: 1  },
    'usdtsol':   { moneda: 'USDT', red: 'Solana',   minimo_usd: 1  },
    'usdterc20': { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },
    'usdcsol':   { moneda: 'USDC', red: 'Solana',   minimo_usd: 1  },
    'usdcmatic': { moneda: 'USDC', red: 'Polygon',  minimo_usd: 1  },
    'usdcbsc':   { moneda: 'USDC', red: 'BSC',      minimo_usd: 1  },
    'usdc':      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 }
};

// Límites de la campaña
const MAX_MXN = 1000000;        // 1 millón de pesos
const MAX_PENDIENTES = 10;      // campañas sin pagar por usuario (ajustable)

// Regex UUID v4 (suficientemente estricta para validar IDs de Supabase)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ================================================================
// HELPERS
// ================================================================

function respuestaError(res, status, error) {
    return res.status(status).json({ success: false, error });
}

// Devuelve URL válida (http/https) o null si es inválida.
function urlSegura(valor) {
    if (!valor || typeof valor !== 'string') return null;
    try {
        const u = new URL(valor.trim());
        return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null;
    } catch {
        return null;
    }
}

// Verifica que payCurrency sea una red soportada y que el monto
// en MXN alcance el mínimo en USD de esa red.
function validarRedPago(payCurrency, montoMxn) {
    const red = REDES_PERMITIDAS[payCurrency];
    if (!red) return { valido: false, error: 'Red de pago no soportada' };

    const montoUsd = Number(montoMxn) * MXN_A_USD_APROX;
    if (montoUsd < red.minimo_usd) {
        const minimoMxn = Math.ceil(red.minimo_usd / MXN_A_USD_APROX);
        return {
            valido: false,
            error:
                `El monto es demasiado bajo para ${red.moneda} en ${red.red}. ` +
                `Mínimo: ${red.minimo_usd} USD (~$${minimoMxn} MXN)`
        };
    }
    return { valido: true, red };
}

// ================================================================
// POST /api/campanas/crear
// ================================================================

router.post('/crear', verificarToken, limitadorPagos, async (req, res) => {
    try {
        const userId = req.usuario?.id;

        if (!userId) {
            return respuestaError(res, 401, 'No autenticado');
        }

        const b = req.body || {};
        const ad = b.ad || {};

        // ---------------------------------------------------------
        // Normalización
        // ---------------------------------------------------------

        const nombre = String(b.nombre || '').trim().slice(0, 120);
        const objetivo = String(b.objetivo || '').trim();
        const presupuesto = Number(b.presupuesto);
        const destinoTipo = String(b.destino_tipo || '').trim();
        const destinoIdRaw = String(b.destino_id || '').trim();

        const titulo = String(ad.titulo || '').trim().slice(0, 150);
        const descripcion = String(ad.descripcion || '').trim().slice(0, 500);
        const cta = String(ad.cta_texto || 'Ver más').trim().slice(0, 40);

        const imagen = urlSegura(ad.imagen_url);
        const video = urlSegura(ad.video_url);

        // Pay currency: default usdttrc20 para no romper si el frontend
        // todavía no lo envía.
        const payCurrency = String(b.pay_currency || 'usdttrc20').trim().toLowerCase();

        // ---------------------------------------------------------
        // Validaciones básicas
        // ---------------------------------------------------------

        if (!nombre) return respuestaError(res, 400, 'Nombre requerido');

        if (!OBJETIVOS.includes(objetivo)) {
            return respuestaError(res, 400, 'Objetivo inválido');
        }

        if (!Number.isFinite(presupuesto) || presupuesto <= 0 || presupuesto > MAX_MXN) {
            return respuestaError(res, 400, 'Presupuesto inválido');
        }

        if (!DESTINOS.includes(destinoTipo)) {
            return respuestaError(res, 400, 'Tipo de destino inválido');
        }

        if (!destinoIdRaw) {
            return respuestaError(res, 400, 'Destino requerido');
        }

        if (!titulo) return respuestaError(res, 400, 'Título requerido');

        if (ad.imagen_url && !imagen) {
            return respuestaError(res, 400, 'URL de imagen inválida');
        }

        if (ad.video_url && !video) {
            return respuestaError(res, 400, 'URL de video inválida');
        }

        // ---------------------------------------------------------
        // Validación del destino según su tipo
        // live   -> INTEGER positivo (transmisiones.id)
        // grupo  -> UUID (grupos_video.id)
        // ---------------------------------------------------------

        let destinoRef;

        if (destinoTipo === 'live') {
            const num = Number(destinoIdRaw);
            if (!Number.isInteger(num) || num <= 0) {
                return respuestaError(res, 400, 'ID de live inválido');
            }
            destinoRef = num;
        } else {
            // grupo
            if (!UUID_REGEX.test(destinoIdRaw)) {
                return respuestaError(res, 400, 'ID de grupo inválido');
            }
            destinoRef = destinoIdRaw;
        }

        // ---------------------------------------------------------
        // Validar red de pago contra presupuesto
        // ---------------------------------------------------------

        const validacionRed = validarRedPago(payCurrency, presupuesto);
        if (!validacionRed.valido) {
            return respuestaError(res, 400, validacionRed.error);
        }

        // ---------------------------------------------------------
        // Límite de campañas pendientes por usuario
        // ---------------------------------------------------------

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
            return respuestaError(
                res,
                429,
                'Tienes demasiadas campañas sin pagar. Completa o cancela alguna antes de crear otra.'
            );
        }

        // ---------------------------------------------------------
        // Verificar que el destino exista
        // ---------------------------------------------------------

        const tabla = destinoTipo === 'live' ? 'transmisiones' : 'grupos_video';

        const { data: destino, error: errDest } = await supabaseAdmin
            .from(tabla)
            .select('id')
            .eq('id', destinoRef)
            .maybeSingle();

        if (errDest) {
            logger.error(`campanas/crear destino: ${errDest.message}`);
            return respuestaError(res, 500, 'Error verificando el destino');
        }

        if (!destino) {
            return respuestaError(res, 400, 'Destino no encontrado');
        }

        // ---------------------------------------------------------
        // Insert 1: campaña
        // ---------------------------------------------------------

        const { data: camp, error: e1 } = await supabaseAdmin
            .from('marketing_campaigns')
            .insert({
                anunciante_id: userId,
                nombre,
                objetivo,
                presupuesto,
                moneda: 'MXN',
                estado: 'pendiente_pago',
                fecha_inicio: new Date().toISOString(),
                fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            })
            .select('id')
            .single();

        if (e1 || !camp) {
            logger.error(`campanas/crear campaña: ${e1?.message || 'sin datos'}`);
            return respuestaError(res, 500, 'No se pudo crear la campaña');
        }

        const campaignId = camp.id;

        // Rollback manual: si algo falla después, borramos todo lo insertado.
        const revertir = async () => {
            try {
                await supabaseAdmin
                    .from('marketing_ads')
                    .delete()
                    .eq('campaign_id', campaignId);

                await supabaseAdmin
                    .from('marketing_campaign_targets')
                    .delete()
                    .eq('campaign_id', campaignId);

                await supabaseAdmin
                    .from('marketing_campaigns')
                    .delete()
                    .eq('id', campaignId);
            } catch (e) {
                logger.error(`campanas/crear rollback falló: ${e.message}`);
            }
        };

        // ---------------------------------------------------------
        // Insert 2: anuncio
        // ---------------------------------------------------------

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

        // ---------------------------------------------------------
        // Insert 3: target
        // ---------------------------------------------------------

        const targetRow = {
            campaign_id: campaignId,
            target_tipo: destinoTipo
        };

        if (destinoTipo === 'live') {
            targetRow.live_id = destinoRef;
        } else {
            targetRow.grupo_id = destinoRef;
        }

        const { error: e3 } = await supabaseAdmin
            .from('marketing_campaign_targets')
            .insert(targetRow);

        if (e3) {
            logger.error(`campanas/crear target: ${e3.message}`);
            await revertir();
            return respuestaError(res, 500, 'No se pudo crear el destino de la campaña');
        }

        // ---------------------------------------------------------
        // Respuesta
        // ---------------------------------------------------------

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

// ================================================================
// EXPORT
// ================================================================

module.exports = router;