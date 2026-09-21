// ================================================================
// SERVICES/PAY/PROVIDERS/FINTOC.JS
// CSARIEL'S PAY - ADAPTER DE FINTOC (SPEI, SOLO MÉXICO)
// ================================================================
// Encapsula toda la comunicación con Fintoc.
// - Cobros: crearPago(intencion) -> Account Number (CLABE)
// - Payouts: crearPayout(retiro) viene de fintoc-payout.js
// - Webhooks: procesarWebhook(req)
//
// Webhook: Fintoc-Signature: t=<timestamp>,v1=<hmac_hex>
// Firma:  HMAC-SHA256(secret, "<timestamp>.<rawBody>")
// ================================================================

'use strict';

const crypto = require('crypto');

const { supabaseAdmin } = require('../../../config/supabase');
const logger = require('../../../utils/logger');
const errors = require('../errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const FINTOC_SECRET_KEY = process.env.FINTOC_SECRET_KEY;
const FINTOC_WEBHOOK_SECRET = process.env.FINTOC_WEBHOOK_SECRET;

const FINTOC_API_BASE = 'https://api.fintoc.com';
const FINTOC_API_VERSION = 'v2';
const FINTOC_TIMEOUT_MS = 20000;
const FINTOC_TOLERANCIA_WEBHOOK_SEG = 300;

// Eventos que nos interesan (cobros + payouts)
const EVENTOS_RELEVANTES = [
    'transfer.inbound.succeeded',
    'transfer.inbound.failed',
    'transfer.inbound.returned',
    'transfer.outbound.succeeded',
    'transfer.outbound.failed',
    'transfer.outbound.rejected'
];

// ================================================================
// HELPERS HTTP
// ================================================================

function verificarConfiguracion() {
    if (!FINTOC_SECRET_KEY) {
        throw errors.errorProveedorNoConfigurado('fintoc (falta FINTOC_SECRET_KEY)');
    }
}

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

async function llamarFintoc(metodo, ruta, cuerpo) {
    verificarConfiguracion();

    const url = `${FINTOC_API_BASE}/${FINTOC_API_VERSION}${ruta}`;

    const opciones = {
        method: metodo,
        headers: {
            'Authorization': FINTOC_SECRET_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(FINTOC_TIMEOUT_MS)
    };

    if (cuerpo !== undefined && cuerpo !== null) {
        opciones.body = JSON.stringify(cuerpo);
    }

    let respuesta;
    try {
        respuesta = await fetch(url, opciones);
    } catch (errFetch) {
        logger.error(`[Fintoc] Error de red en ${metodo} ${ruta}: ${errFetch.message}`);

        if (errFetch.name === 'TimeoutError' || errFetch.name === 'AbortError') {
            throw errors.errorProveedorTimeout('fintoc');
        }

        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: errFetch.message
        });
    }

    let data;
    const textoRespuesta = await respuesta.text();

    try {
        data = textoRespuesta ? JSON.parse(textoRespuesta) : {};
    } catch (errJson) {
        logger.error(`[Fintoc] Respuesta no-JSON en ${metodo} ${ruta}: ${textoRespuesta.slice(0, 200)}`);
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: 'respuesta_invalida',
            http_status: respuesta.status
        });
    }

    if (!respuesta.ok) {
        const esTemporal = respuesta.status >= 500;
        const motivo = data && (data.message || data.error) ? (data.message || data.error) : `HTTP ${respuesta.status}`;

        logger.error(`[Fintoc] Error ${respuesta.status} en ${metodo} ${ruta}: ${motivo}`);

        if (esTemporal) {
            throw errors.errorProveedorErrorTemporal('fintoc', {
                http_status: respuesta.status,
                motivo: motivo
            });
        }

        throw errors.errorProveedorRechazo('fintoc', motivo, {
            http_status: respuesta.status,
            codigo_fintoc: data && data.code ? data.code : null
        });
    }

    return data;
}

// ================================================================
// CREAR PAGO (Account Number / CLABE) — cobros
// ================================================================

async function crearPago(intencion) {
    verificarSupabaseAdmin();
    verificarConfiguracion();

    if (!intencion || !intencion.id) {
        throw errors.errorParametroRequerido('intencion');
    }

    if (intencion.provider_payment_id && intencion.provider_reference) {
        logger.info(`[Fintoc] Reusando CLABE existente para intención ${intencion.id}`);

        return {
            provider_payment_id: intencion.provider_payment_id,
            provider_reference: intencion.provider_reference,
            clabe: intencion.provider_reference,
            reutilizado: true
        };
    }

    const metadataFintoc = {
        csariels_intencion_id: intencion.id,
        csariels_public_token: intencion.public_token,
        csariels_pedido_id: intencion.pedido_id ? String(intencion.pedido_id) : '',
        csariels_descripcion: (intencion.descripcion || '').slice(0, 100)
    };

    const cuerpo = {
        currency: 'MXN',
        metadata: metadataFintoc
    };

    let respuesta;
    try {
        respuesta = await llamarFintoc('POST', '/account_numbers', cuerpo);
    } catch (errFintoc) {
        logger.error(`[Fintoc] Error creando Account Number: ${errFintoc.message}`);
        throw errFintoc;
    }

    if (!respuesta || !respuesta.id || !respuesta.number) {
        logger.error(`[Fintoc] Respuesta sin id/number: ${JSON.stringify(respuesta).slice(0, 300)}`);
        throw errors.errorProveedorErrorTemporal('fintoc', {
            motivo: 'respuesta_sin_clabe'
        });
    }

    const accountId = respuesta.id;
    const clabe = respuesta.number;

    const { error: errUpdate } = await supabaseAdmin
        .from('pay_intenciones')
        .update({
            provider_payment_id: accountId,
            provider_reference: clabe,
            updated_at: new Date().toISOString()
        })
        .eq('id', intencion.id);

    if (errUpdate) {
        logger.error(`[Fintoc] Error guardando CLABE en intención: ${errUpdate.message}`);
    }

    logger.info(
        `[Fintoc] Account Number creado: ${accountId} (CLABE ${clabe.slice(-4)}) ` +
        `para intención ${intencion.id}`
    );

    return {
        provider_payment_id: accountId,
        provider_reference: clabe,
        clabe: clabe,
        banco: respuesta.institution || null,
        reutilizado: false
    };
}

// ================================================================
// VERIFICAR FIRMA DE WEBHOOK
// ================================================================

function verificarFirmaWebhook(req) {
    if (!FINTOC_WEBHOOK_SECRET) {
        return { valida: false, motivo: 'FINTOC_WEBHOOK_SECRET_no_configurado' };
    }

    const headerFirma = req.headers['fintoc-signature'] || req.headers['Fintoc-Signature'];

    if (!headerFirma || typeof headerFirma !== 'string') {
        return { valida: false, motivo: 'header_firma_ausente' };
    }

    const partes = headerFirma.split(',').reduce(function (acc, item) {
        const idx = item.indexOf('=');
        if (idx > 0) {
            const clave = item.slice(0, idx).trim();
            const valor = item.slice(idx + 1).trim();
            acc[clave] = valor;
        }
        return acc;
    }, {});

    const timestamp = partes.t;
    const firmaRecibida = partes.v1;

    if (!timestamp || !firmaRecibida) {
        return { valida: false, motivo: 'formato_firma_invalido' };
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
        return { valida: false, motivo: 'timestamp_no_numerico' };
    }

    const ahoraSeg = Math.floor(Date.now() / 1000);
    const diffSeg = Math.abs(ahoraSeg - tsNum);

    if (diffSeg > FINTOC_TOLERANCIA_WEBHOOK_SEG) {
        return {
            valida: false,
            motivo: 'timestamp_fuera_de_rango',
            diff_seg: diffSeg
        };
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
        return { valida: false, motivo: 'rawBody_ausente' };
    }

    const cuerpoAFirmar = `${timestamp}.${rawBody.toString('utf8')}`;

    const firmaCalculada = crypto
        .createHmac('sha256', FINTOC_WEBHOOK_SECRET)
        .update(cuerpoAFirmar, 'utf8')
        .digest('hex');

    let firmaValida = false;
    try {
        const bufRecibida = Buffer.from(firmaRecibida, 'hex');
        const bufCalculada = Buffer.from(firmaCalculada, 'hex');

        if (bufRecibida.length === bufCalculada.length) {
            firmaValida = crypto.timingSafeEqual(bufRecibida, bufCalculada);
        }
    } catch (errCompare) {
        firmaValida = false;
    }

    return {
        valida: firmaValida,
        motivo: firmaValida ? null : 'firma_no_coincide',
        timestamp: tsNum
    };
}

// ================================================================
// EXTRAER RETIRO_ID DE UN WEBHOOK DE PAYOUT
// ================================================================
// Los payouts salientes tienen en su metadata el csariels_retiro_id
// que pusimos en fintoc-payout.js al crear la transferencia.
// ================================================================

function extraerRetiroIdDeWebhook(objeto, body) {
    // 1) Directo en objeto.metadata
    if (objeto && objeto.metadata && objeto.metadata.csariels_retiro_id) {
        return objeto.metadata.csariels_retiro_id;
    }

    // 2) En body.metadata
    if (body && body.metadata && body.metadata.csariels_retiro_id) {
        return body.metadata.csariels_retiro_id;
    }

    // 3) En objeto.transfer.metadata
    if (objeto && objeto.transfer && objeto.transfer.metadata && objeto.transfer.metadata.csariels_retiro_id) {
        return objeto.transfer.metadata.csariels_retiro_id;
    }

    return null;
}

// ================================================================
// PROCESAR WEBHOOK
// ================================================================
// Ahora detecta si es un webhook de cobro o de payout:
//   - transfer.inbound.*  -> confirmar_intencion (cobro)
//   - transfer.outbound.* -> cerrar_retiro (payout)
// ================================================================

async function procesarWebhook(req) {
    verificarSupabaseAdmin();

    const body = req.body || {};

    // ---------- Verificar firma ----------
    const resultadoFirma = verificarFirmaWebhook(req);

    if (!resultadoFirma.valida) {
        logger.warning(`[Fintoc] Firma inválida: ${resultadoFirma.motivo}`);

        return {
            firma_valida: false,
            event_id: null,
            tipo_evento: null,
            accion: 'ignorar',
            intencion_id: null,
            retiro_id: null,
            provider_transaction_id: null,
            provider_status: null,
            provider_fee_mxn: 0,
            network_fee_mxn: 0,
            metadata: {},
            payload_crudo: body
        };
    }

    // ---------- Identificar tipo de evento ----------
    const tipoEvento = body.type || body.event || null;
    const objeto = body.data || body.object || body;
    const eventId = body.id || (objeto && objeto.id) || null;

    if (!tipoEvento || !eventId) {
        logger.warning(`[Fintoc] Webhook sin tipo o sin id: ${JSON.stringify(body).slice(0, 200)}`);

        return {
            firma_valida: true,
            event_id: eventId || `sin_id_${Date.now()}`,
            tipo_evento: tipoEvento || 'desconocido',
            accion: 'ignorar',
            intencion_id: null,
            retiro_id: null,
            provider_transaction_id: null,
            provider_status: null,
            provider_fee_mxn: 0,
            network_fee_mxn: 0,
            metadata: {},
            payload_crudo: body
        };
    }

    // ---------- Filtrar eventos no relevantes ----------
    if (!EVENTOS_RELEVANTES.includes(tipoEvento)) {
        return {
            firma_valida: true,
            event_id: eventId,
            tipo_evento: tipoEvento,
            accion: 'ignorar',
            intencion_id: null,
            retiro_id: null,
            provider_transaction_id: null,
            provider_status: null,
            provider_fee_mxn: 0,
            network_fee_mxn: 0,
            metadata: {},
            payload_crudo: body
        };
    }

    // ---------- Extraer metadata de conciliación ----------
    const metadataObjeto = objeto.metadata ||
        (objeto.account_number && objeto.account_number.metadata) ||
        {};

    // ---------- Determinar si es COBRO o PAYOUT ----------
    let accion = 'ignorar';
    let providerStatus = null;
    let intencionId = null;
    let retiroId = null;

    if (tipoEvento.startsWith('transfer.inbound.')) {
        // ─── Es un COBRO (dinero entrando a la cuenta Fintoc) ───
        intencionId = metadataObjeto.csariels_intencion_id || null;

        if (tipoEvento === 'transfer.inbound.succeeded') {
            accion = 'confirmar_intencion';
            providerStatus = 'succeeded';
        } else if (tipoEvento === 'transfer.inbound.failed' ||
                   tipoEvento === 'transfer.inbound.returned') {
            accion = 'ignorar';
            providerStatus = tipoEvento === 'transfer.inbound.returned' ? 'returned' : 'failed';
        }

    } else if (tipoEvento.startsWith('transfer.outbound.')) {
        // ─── Es un PAYOUT (dinero saliendo de la cuenta Fintoc) ───
        retiroId = extraerRetiroIdDeWebhook(objeto, body);

        if (tipoEvento === 'transfer.outbound.succeeded') {
            accion = 'cerrar_retiro';
            providerStatus = 'succeeded';
        } else if (tipoEvento === 'transfer.outbound.failed') {
            accion = 'cerrar_retiro';
            providerStatus = 'failed';
        } else if (tipoEvento === 'transfer.outbound.rejected') {
            accion = 'cerrar_retiro';
            providerStatus = 'rejected';
        }
    }

    // ---------- Comisiones ----------
    const providerFeeMxn = 0;
    const networkFeeMxn = 0;
    const montoTransferido = objeto.amount || objeto.amount_mxn || null;

    return {
        firma_valida: true,
        event_id: eventId,
        tipo_evento: tipoEvento,
        accion: accion,
        intencion_id: intencionId,
        retiro_id: retiroId,
        provider_transaction_id: objeto.id || null,
        provider_status: providerStatus,
        provider_fee_mxn: providerFeeMxn,
        network_fee_mxn: networkFeeMxn,
        metadata: {
            fintoc_event_id: eventId,
            fintoc_transfer_id: objeto.id || null,
            fintoc_amount: montoTransferido,
            fintoc_currency: objeto.currency || 'MXN',
            fintoc_status: objeto.status || null,
            fintoc_direction: tipoEvento.startsWith('transfer.outbound.') ? 'outbound' : 'inbound'
        },
        payload_crudo: body
    };
}

// ================================================================
// RE-EXPORTAR crearPayout desde fintoc-payout.js
// ================================================================
// Para que retiros.js lo encuentre como adapter.crearPayout()
// ================================================================

const payoutModule = require('./fintoc-payout');
module.exports = {
    crearPago: crearPago,
    procesarWebhook: procesarWebhook,
    verificarFirmaWebhook: verificarFirmaWebhook,
    llamarFintoc: llamarFintoc,
    crearPayout: payoutModule.crearPayout,
    consultarTransfer: payoutModule.consultarTransfer
};