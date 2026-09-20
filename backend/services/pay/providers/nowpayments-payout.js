// ================================================================
// SERVICES/PAY/PROVIDERS/NOWPAYMENTS-PAYOUT.JS
// CSARIEL'S PAY - PAYOUTS DE NOWPAYMENTS (USDT / USDC)
// ================================================================
// Implementa crearPayout(retiro) para retiros crypto.
//
// Retiros salientes: cuando un vendedor/repartidor pide retirar
// sus ganancias en USDT o USDC a una wallet propia.
//
// API de NOWPayments payouts:
//   POST /v1/payout/validate-address   -> valida wallet
//   POST /v1/payout                    -> crea payout
//
// Requiere que la cuenta de NOWPayments tenga payouts habilitados.
// Si no, la API devuelve error 4xx y este adapter lo propaga.
//
// NOTA: este módulo se exporta desde nowpayments.js para que
// retiros.js lo encuentre como adapter.crearPayout().
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../../config/supabase');
const logger = require('../../../utils/logger');
const errors = require('../errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_TIMEOUT_MS = 20000;

// Tipo de cambio para calcular cuánto USDT enviar.
// Coincide con routes/mercado.js.
const TIPO_CAMBIO_MXN_USD = 17.5;

// Margen de seguridad para cubrir comisiones de red.
// 0.98 = se envía el 98% del cálculo (2% menos).
// Ajustable. Sirve para que la comisión de red no haga que
// el retiro quede sub-financiado.
const FACTOR_SEGURIDAD_RED = 0.98;

// Redes permitidas para payouts (mismas que cobros)
const REDES_PERMITIDAS_PAYOUT = {
    usdt: ['usdttrc20', 'usdtbsc', 'usdtmatic', 'usdtsol', 'usdterc20'],
    usdc: ['usdcsol', 'usdcmatic', 'usdcbsc', 'usdc']
};

// ================================================================
// HELPERS
// ================================================================

function verificarConfiguracion() {
    if (!NOWPAYMENTS_API_KEY) {
        throw errors.errorProveedorNoConfigurado('nowpayments (falta NOWPAYMENTS_API_KEY)');
    }
}

async function llamarNowPayments(metodo, ruta, cuerpo) {
    verificarConfiguracion();

    const url = `${NOWPAYMENTS_API_BASE}${ruta}`;

    const opciones = {
        method: metodo,
        headers: {
            'x-api-key': NOWPAYMENTS_API_KEY,
            'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(NOWPAYMENTS_TIMEOUT_MS)
    };

    if (cuerpo !== undefined && cuerpo !== null) {
        opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
        respuesta = await fetch(url, opciones);
    } catch (errFetch) {
        logger.error(`[NOWPayments Payout] Error de red en ${metodo} ${ruta}: ${errFetch.message}`);

        if (errFetch.name === 'TimeoutError' || errFetch.name === 'AbortError') {
            throw errors.errorProveedorTimeout('nowpayments');
        }

        throw errors.errorProveedorErrorTemporal('nowpayments', {
            motivo: errFetch.message
        });
    }

    let data;
    const textoRespuesta = await respuesta.text();

    try {
        data = textoRespuesta ? JSON.parse(textoRespuesta) : {};
    } catch (errJson) {
        logger.error(`[NOWPayments Payout] Respuesta no-JSON en ${metodo} ${ruta}`);
        throw errors.errorProveedorErrorTemporal('nowpayments', {
            motivo: 'respuesta_invalida',
            http_status: respuesta.status
        });
    }

    if (!respuesta.ok) {
        const esTemporal = respuesta.status >= 500 || respuesta.status === 429;
        const motivo = data && (data.message || data.error)
            ? (data.message || data.error)
            : `HTTP ${respuesta.status}`;

        logger.error(`[NOWPayments Payout] Error ${respuesta.status} en ${metodo} ${ruta}: ${motivo}`);

        if (esTemporal) {
            throw errors.errorProveedorErrorTemporal('nowpayments', {
                http_status: respuesta.status,
                motivo: motivo
            });
        }

        // Errores de validación (4xx): permanentes
        throw errors.errorProveedorRechazo('nowpayments', motivo, {
            http_status: respuesta.status,
            codigo_nowpayments: data && data.code ? data.code : null
        });
    }

    return data;
}

// ================================================================
// VALIDAR DESTINO DEL RETIRO
// ================================================================

function validarRetiro(retiro) {
    if (!retiro || !retiro.id) {
        throw errors.errorParametroRequerido('retiro');
    }

    if (!retiro.wallet_destino || typeof retiro.wallet_destino !== 'string') {
        throw errors.errorDestinoRetiroInvalido({
            motivo: 'Falta wallet_destino'
        });
    }

    if (!retiro.red_crypto || typeof retiro.red_crypto !== 'string') {
        throw errors.errorDestinoRetiroInvalido({
            motivo: 'Falta red_crypto'
        });
    }

    if (!retiro.moneda_destino || !['USDT', 'USDC'].includes(retiro.moneda_destino)) {
        throw errors.errorDestinoRetiroInvalido({
            motivo: 'moneda_destino debe ser USDT o USDC'
        });
    }

    const monto = Number(retiro.monto_mxn);
    if (!Number.isFinite(monto) || monto <= 0) {
        throw errors.errorMontoInvalido();
    }

    // Verificar que la red sea válida para la moneda
    const claveMoneda = retiro.moneda_destino === 'USDT' ? 'usdt' : 'usdc';
    const redesValidas = REDES_PERMITIDAS_PAYOUT[claveMoneda] || [];

    if (!redesValidas.includes(retiro.red_crypto)) {
        throw errors.errorDestinoRetiroInvalido({
            motivo: `Red ${retiro.red_crypto} no permitida para ${retiro.moneda_destino}`,
            redes_validas: redesValidas
        });
    }
}

// ================================================================
// CREAR PAYOUT
// ================================================================
// Args:
//   retiro -> fila de pay_retiros con:
//     id, monto_mxn, moneda_destino, red_crypto, wallet_destino
//
// Devuelve:
//   {
//     provider_transfer_id: 'payout_id_...',
//     provider_status: 'CREATING' | 'PROCESSING' | 'FINISHED',
//     estado_inmediato: 'processing' | 'completed',
//     metadata: {...}
//   }
// ================================================================

async function crearPayout(retiro) {
    validarRetiro(retiro);

    // ---------- 1) Calcular monto en crypto ----------
    const montoMxn = Number(retiro.monto_mxn);
    const montoUsd = montoMxn / TIPO_CAMBIO_MXN_USD;
    const montoCryptoConMargen = Math.round(montoUsd * FACTOR_SEGURIDAD_RED * 100) / 100;

    if (montoCryptoConMargen <= 0) {
        throw errors.errorMontoInvalido({
            monto_mxn: montoMxn,
            monto_usd_calculado: montoUsd
        });
    }

    // ---------- 2) Validar dirección en NOWPayments ----------
    try {
        const validacion = await llamarNowPayments(
            'POST',
            '/payout/validate-address',
            {
                address: retiro.wallet_destino,
                currency: retiro.red_crypto
            }
        );

        // NOWPayments devuelve { result: true|false } en algunas versiones.
        if (validacion && validacion.result === false) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Wallet rechazada por NOWPayments',
                detalle: validacion
            });
        }
    } catch (errValid) {
        // Si es un error 4xx permanente, propagar tal cual (wallet inválida).
        // Si es 5xx o timeout, propagar como reintentable.
        logger.warning(`[NOWPayments Payout] Validación de wallet falló: ${errValid.message}`);
        throw errValid;
    }

    // ---------- 3) Crear el payout ----------
    const payoutDescription = `csariels_${retiro.id}`;

    const payload = {
        withdrawals: [
            {
                address: retiro.wallet_destino,
                currency: retiro.red_crypto,
                amount: montoCryptoConMargen,
                ipn_callback_url: process.env.PUBLIC_URL
                    ? `${process.env.PUBLIC_URL}/api/pay/webhooks/nowpayments`
                    : undefined,
                payout_description: payoutDescription
            }
        ]
    };

    let respuesta;
    try {
        respuesta = await llamarNowPayments('POST', '/payout', payload);
    } catch (errPayout) {
        logger.error(`[NOWPayments Payout] Error creando payout: ${errPayout.message}`);
        throw errPayout;
    }

    // NOWPayments responde { id: '...', withdrawals: [...], status: '...' }
    // o { withdrawals: [ {...} ] } según versión.
    let payoutId = null;
    let payoutStatus = null;

    if (respuesta) {
        if (respuesta.id) {
            payoutId = String(respuesta.id);
        }

        if (respuesta.status) {
            payoutStatus = String(respuesta.status).toUpperCase();
        }

        // Si viene en withdrawals[0]
        if (!payoutId && Array.isArray(respuesta.withdrawals) && respuesta.withdrawals.length > 0) {
            const w = respuesta.withdrawals[0];
            payoutId = w.id ? String(w.id) : null;
            payoutStatus = w.status ? String(w.status).toUpperCase() : null;
        }
    }

    if (!payoutId) {
        logger.error(`[NOWPayments Payout] Respuesta sin payout id: ${JSON.stringify(respuesta).slice(0, 300)}`);
        throw errors.errorProveedorErrorTemporal('nowpayments', {
            motivo: 'respuesta_sin_payout_id'
        });
    }

    // ---------- 4) Mapear estado ----------
    let estadoInmediato = 'processing';

    if (payoutStatus === 'FINISHED' || payoutStatus === 'SUCCESS') {
        estadoInmediato = 'completed';
    } else if (payoutStatus === 'FAILED' || payoutStatus === 'REJECTED') {
        // Esto solo pasa si NOWPayments rechaza en el momento.
        // El webhook no va a llegar. Marcamos como failed para
        // que el caller cierre con pay_cerrar_retiro.
        estadoInmediato = 'failed';
    }

    logger.info(
        `[NOWPayments Payout] Payout creado: ${payoutId} ` +
        `para retiro ${retiro.id} (${montoCryptoConMargen} ${retiro.moneda_destino} en ${retiro.red_crypto})`
    );

    return {
        provider_transfer_id: payoutId,
        provider_status: payoutStatus || 'CREATING',
        estado_inmediato: estadoInmediato,
        provider_destination_id: null,
        metadata: {
            nowpayments_payout_id: payoutId,
            nowpayments_amount_crypto: montoCryptoConMargen,
            nowpayments_currency: retiro.red_crypto,
            nowpayments_tipo_cambio_usado: TIPO_CAMBIO_MXN_USD
        }
    };
}

// ================================================================
// CONSULTAR PAYOUT (para reconciliación)
// ================================================================

async function consultarPayout(payoutId) {
    if (!payoutId) {
        throw errors.errorParametroRequerido('payoutId');
    }

    const respuesta = await llamarNowPayments(
        'GET',
        `/payout/${encodeURIComponent(payoutId)}`,
        null
    );

    return respuesta;
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    crearPayout: crearPayout,
    consultarPayout: consultarPayout
};