// ================================================================
// SERVICES/PAY/PROVIDERS/FINTOC-PAYOUT.JS
// CSARIEL'S PAY - PAYOUTS SPEI CON FINTOC (RETIROS SALIENTES)
// ================================================================
// Crea transferencias salientes desde la cuenta Fintoc de la
// plataforma hacia la CLABE del vendedor/repartidor.
//
// NO requiere fintoc.js. Tiene su propio cliente HTTP para evitar
// dependencia circular (fintoc.js re-exporta crearPayout desde aquí).
//
// Clasificación de errores (decide si se devuelve saldo):
//   - Permanentes (reintentable = false): datos inválidos o rechazo
//     de Fintoc (4xx). Se marca el retiro como failed y se reembolsa.
//   - Temporales (reintentable = true): red, timeout, 5xx, 429,
//     401/403 y configuración faltante. El retiro queda en pending
//     con el saldo reservado; nunca se reembolsa por estos errores.
//
// Variables de entorno requeridas:
//   FINTOC_SECRET_KEY
//   FINTOC_SOURCE_ACCOUNT_ID   (id de la cuenta Fintoc que paga)
// ================================================================

'use strict';

const logger = require('../../../utils/logger');
const errors = require('../errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const FINTOC_API_BASE = 'https://api.fintoc.com';
const FINTOC_API_VERSION = 'v2';
const FINTOC_TIMEOUT_MS = 20000;

// ================================================================
// HELPERS DE CONFIGURACIÓN
// ================================================================

/**
 * Error de configuración faltante. Es temporal a propósito: si falta
 * una variable, el dinero NO debe devolverse, solo esperar.
 */
function errorConfigPendiente(motivo) {
    return errors.errorProveedorErrorTemporal('fintoc', { motivo: motivo });
}

function obtenerSecretKey() {
    const key = process.env.FINTOC_SECRET_KEY;

    if (!key) {
        throw errorConfigPendiente('config_fintoc_secret_key_faltante');
    }

    return key;
}

function obtenerSourceAccountId() {
    const id = process.env.FINTOC_SOURCE_ACCOUNT_ID;

    if (!id) {
        throw errorConfigPendiente('config_fintoc_source_account_faltante');
    }

    return id;
}

// ================================================================
// CLIENTE HTTP
// ================================================================

async function llamarFintoc(metodo, ruta, cuerpo, headersExtra) {
    const secretKey = obtenerSecretKey();
    const sourceAccountId = obtenerSourceAccountId();

    const url = `${FINTOC_API_BASE}/${FINTOC_API_VERSION}${ruta}`;

    const headers = Object.assign(
        {
            'Authorization': secretKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Fintoc-Account-Id': sourceAccountId
        },
        headersExtra || {}
    );

    const opciones = {
        method: metodo,
        headers: headers,
        signal: AbortSignal.timeout(FINTOC_TIMEOUT_MS)
    };

    if (cuerpo !== undefined && cuerpo !== null) {
        opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;

    try {
        respuesta = await fetch(url, opciones);
    } catch (errFetch) {
        logger.error(`[Fintoc Payout] Error de red en ${metodo} ${ruta}: ${errFetch.message}`);

        if (errFetch.name === 'TimeoutError' || errFetch.name === 'AbortError') {
            throw errors.errorProveedorTimeout('fintoc');
        }

        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: errFetch.message
        });
    }

    const texto = await respuesta.text();
    let data;

    try {
        data = texto ? JSON.parse(texto) : {};
    } catch (errJson) {
        logger.error(`[Fintoc Payout] Respuesta no JSON en ${metodo} ${ruta} (HTTP ${respuesta.status})`);
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: 'respuesta_invalida',
            http_status: respuesta.status
        });
    }

    if (respuesta.ok) {
        return data;
    }

    const motivo = (data && (data.message || data.error))
        ? String(data.message || data.error)
        : `HTTP ${respuesta.status}`;

    logger.error(`[Fintoc Payout] Error ${respuesta.status} en ${metodo} ${ruta}: ${motivo}`);

    // 401/403: credenciales o permisos. Temporal: no se reembolsa.
    if (respuesta.status === 401 || respuesta.status === 403) {
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: 'credenciales_o_permisos',
            http_status: respuesta.status
        });
    }

    // 409, 429 y 5xx: transitorios. Temporal.
    if (respuesta.status === 409 || respuesta.status === 429 || respuesta.status >= 500) {
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: motivo,
            http_status: respuesta.status
        });
    }

    // Otros 4xx: el request fue rechazado por contenido. Permanente.
    throw errors.errorProveedorRechazo('fintoc', motivo, {
        http_status: respuesta.status,
        codigo_fintoc: data && data.code ? data.code : null
    });
}

// ================================================================
// MAPEO DE ESTADOS DE FINTOC
// ================================================================

function mapearEstado(status) {
    const s = String(status || '').toLowerCase();

    if (['succeeded', 'completed', 'paid'].includes(s)) {
        return 'completed';
    }

    if (['failed', 'rejected', 'canceled', 'cancelled', 'returned'].includes(s)) {
        return 'failed';
    }

    return 'processing';
}

// ================================================================
// CREAR PAYOUT
// ================================================================
// Args:
//   retiro -> fila de pay_retiros (id, monto_mxn, cuenta_id, ...)
//   datos  -> { clabe, nombreTitular, rfc } (no se persisten)
//
// Devuelve:
//   {
//     provider_transfer_id: string,
//     provider_status: string,
//     estado_inmediato: 'processing' | 'completed' | 'failed',
//     provider_destination_id: null,
//     metadata: {...}
//   }
// ================================================================

async function crearPayout(retiro, datos) {
    if (!retiro || !retiro.id) {
        throw errors.errorParametroRequerido('retiro');
    }

    const d = datos || {};

    const monto = Number(retiro.monto_mxn);

    if (!Number.isFinite(monto) || monto <= 0) {
        throw errors.errorMontoInvalido({ monto: retiro.monto_mxn });
    }

    if (!d.clabe || !/^\d{18}$/.test(d.clabe)) {
        throw errors.errorDestinoRetiroInvalido({ motivo: 'CLABE inválida' });
    }

    if (!d.nombreTitular) {
        throw errors.errorDestinoRetiroInvalido({ motivo: 'Falta nombre del titular' });
    }

    if (!d.rfc) {
        throw errors.errorDestinoRetiroInvalido({ motivo: 'Falta RFC del titular' });
    }

    // Fintoc maneja montos en centavos para MXN.
    const montoCentavos = Math.round(monto * 100);

    const cuerpo = {
        amount: montoCentavos,
        currency: 'MXN',
        comment: `Retiro Csariel's Pay ${String(retiro.id).slice(0, 8)}`.slice(0, 40),
        counterparty: {
            account_number: d.clabe,
            holder_name: String(d.nombreTitular).slice(0, 100),
            holder_id: String(d.rfc).toUpperCase()
        },
        metadata: {
            csariels_retiro_id: String(retiro.id),
            csariels_cuenta_id: String(retiro.cuenta_id)
        }
    };

    // La llave de idempotencia es el id del retiro: si el request se
    // repite, Fintoc devuelve la misma transferencia y no duplica el pago.
    const headersExtra = {
        'Idempotency-Key': `retiro_${retiro.id}`
    };

    const respuesta = await llamarFintoc('POST', '/transfers', cuerpo, headersExtra);

    if (!respuesta || !respuesta.id) {
        logger.error(
            `[Fintoc Payout] Respuesta sin id para retiro ${retiro.id}: ` +
            `${JSON.stringify(respuesta).slice(0, 200)}`
        );
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: 'respuesta_sin_transfer_id'
        });
    }

    const estadoInterno = mapearEstado(respuesta.status);

    logger.info(
        `[Fintoc Payout] Transferencia ${respuesta.id} creada para retiro ${retiro.id} ` +
        `($${monto} MXN, estado Fintoc: ${respuesta.status || 'desconocido'})`
    );

    return {
        provider_transfer_id: String(respuesta.id),
        provider_status: respuesta.status ? String(respuesta.status) : 'pending',
        estado_inmediato: estadoInterno,
        provider_destination_id: null,
        metadata: {
            fintoc_transfer_id: String(respuesta.id),
            fintoc_status: respuesta.status || null,
            fintoc_amount_centavos: montoCentavos,
            fintoc_currency: 'MXN'
        }
    };
}

// ================================================================
// CONSULTAR TRANSFERENCIA (reconciliación)
// ================================================================

async function consultarTransfer(transferId) {
    if (!transferId) {
        throw errors.errorParametroRequerido('transferId');
    }

    return llamarFintoc('GET', `/transfers/${encodeURIComponent(transferId)}`, null, null);
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    crearPayout: crearPayout,
    consultarTransfer: consultarTransfer,
    mapearEstado: mapearEstado
};