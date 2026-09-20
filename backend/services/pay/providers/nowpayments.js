// ================================================================
// SERVICES/PAY/PROVIDERS/NOWPAYMENTS.JS
// CSARIEL'S PAY - ADAPTER DE NOWPAYMENTS (USDT / USDC)
// ================================================================
// Encapsula toda la comunicación con NOWPayments para USDT y USDC.
// Funciona en los 6 países activos (MX, CO, CL, AR, PE, EC).
//
// El Core llama:
//   - crearPago(intencion)    -> crea payment en NOWPayments
//   - procesarWebhook(req)    -> verifica firma + extrae datos
//
// Reutiliza utils/nowpayments-sig.js para verificar la firma HMAC.
// Sigue el patrón de routes/membresia-webhook-handler.js.
//
// API de NOWPayments: https://api.nowpayments.io/v1
//   POST /payment         -> crea payment
//   GET  /payment/:id     -> consulta estado (para reconciliación)
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../../config/supabase');
const logger = require('../../../utils/logger');
const errors = require('../errors');

// Verificación de firma compartida
let verificarFirmaNowPayments;
try {
    const sigUtils = require('../../../utils/nowpayments-sig');
    verificarFirmaNowPayments = sigUtils.verificarFirmaNowPayments;
} catch (errCarga) {
    logger.warning(`[NOWPayments] No se pudo cargar utils/nowpayments-sig.js: ${errCarga.message}`);
    verificarFirmaNowPayments = null;
}

// ================================================================
// CONFIGURACIÓN
// ================================================================

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_TIMEOUT_MS = 15000;

// URL pública del proyecto (para ipn_callback_url)
const PUBLIC_URL = process.env.PUBLIC_URL || null;

// ================================================================
// REDES PERMITIDAS
// ================================================================
// Copiadas de routes/payments.js para mantener consistencia.
// Si cambian allá, cambian aquí.
// ================================================================

const REDES_PERMITIDAS = {
    // USDT
    'usdttrc20': { moneda: 'USDT', red: 'TRON',     minimo_usd: 1  },
    'usdtbsc':   { moneda: 'USDT', red: 'BSC',      minimo_usd: 1  },
    'usdtmatic': { moneda: 'USDT', red: 'Polygon',  minimo_usd: 1  },
    'usdtsol':   { moneda: 'USDT', red: 'Solana',   minimo_usd: 1  },
    'usdterc20': { moneda: 'USDT', red: 'Ethereum', minimo_usd: 20 },

    // USDC
    'usdcsol':   { moneda: 'USDC', red: 'Solana',   minimo_usd: 1  },
    'usdcmatic': { moneda: 'USDC', red: 'Polygon',  minimo_usd: 1  },
    'usdcbsc':   { moneda: 'USDC', red: 'BSC',      minimo_usd: 1  },
    'usdc':      { moneda: 'USDC', red: 'Ethereum', minimo_usd: 20 }
};

// Red por defecto para cada método
const RED_POR_METODO = {
    usdt: 'usdttrc20',   // TRC20 (más económica)
    usdc: 'usdcmatic'    // Polygon (más económica)
};

// ================================================================
// MAPEO DE ESTADOS NOWPAYMENTS -> ESTADO INTERNO
// ================================================================

const ESTADOS_CONFIRMADOS = ['finished', 'confirmed'];
const ESTADOS_FALLIDOS = ['failed', 'refunded', 'expired', 'canceled', 'cancelled'];
const ESTADOS_EN_PROCESO = ['waiting', 'confirming', 'sending', 'partially_paid'];

// ================================================================
// HELPERS HTTP
// ================================================================

function verificarConfiguracion() {
    if (!NOWPAYMENTS_API_KEY) {
        throw errors.errorProveedorNoConfigurado('nowpayments (falta NOWPAYMENTS_API_KEY)');
    }
}

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
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
        logger.error(`[NOWPayments] Error de red en ${metodo} ${ruta}: ${errFetch.message}`);

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
        logger.error(`[NOWPayments] Respuesta no-JSON en ${metodo} ${ruta}`);
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

        logger.error(`[NOWPayments] Error ${respuesta.status} en ${metodo} ${ruta}: ${motivo}`);

        if (esTemporal) {
            throw errors.errorProveedorErrorTemporal('nowpayments', {
                http_status: respuesta.status,
                motivo: motivo
            });
        }

        throw errors.errorProveedorRechazo('nowpayments', motivo, {
            http_status: respuesta.status
        });
    }

    return data;
}

// ================================================================
// RESOLVER RED A PARTIR DEL MÉTODO
// ================================================================

function resolverRed(metodo) {
    const red = RED_POR_METODO[metodo];

    if (!red) {
        throw errors.errorMetodoInvalido(metodo);
    }

    if (!REDES_PERMITIDAS[red]) {
        throw errors.errorMetodoInvalido(metodo);
    }

    return red;
}

// ================================================================
// CREAR PAGO (Payment en NOWPayments)
// ================================================================
// Se llama desde el Core cuando un comprador elige 'usdt' o 'usdc'.
//
// Args:
//   intencion -> fila de pay_intenciones
//
// Devuelve:
//   {
//     provider_payment_id: '12345',
//     provider_reference: 'TXxx...',   // pay_address
//     pay_address: 'TXxx...',
//     pay_amount: 20.50,
//     pay_currency: 'usdttrc20',
//     payment_url: 'https://...',      // URL de checkout de NOWPayments
//     order_id: 'csariels_...'
//   }
// ================================================================

async function crearPago(intencion) {
    verificarSupabaseAdmin();
    verificarConfiguracion();

    if (!intencion || !intencion.id) {
        throw errors.errorParametroRequerido('intencion');
    }

    // ---------- Idempotencia: si ya hay payment, lo reusamos ----------
    if (intencion.provider_payment_id && intencion.provider_reference) {
        logger.info(`[NOWPayments] Reusando payment existente para intención ${intencion.id}`);

        return {
            provider_payment_id: intencion.provider_payment_id,
            provider_reference: intencion.provider_reference,
            pay_address: intencion.provider_reference,
            reutilizado: true
        };
    }

    // ---------- Resolver red crypto ----------
    const metodo = intencion.metodo_pago;
    const red = resolverRed(metodo);

    // ---------- Idempotency: order_id = intención uuid ----------
    // Esto permite que el webhook sepa a qué intención pertenece.
    const orderId = `csariels_${intencion.id}`;

    // ---------- URL de callback IPN ----------
    const ipnCallbackUrl = PUBLIC_URL
        ? `${PUBLIC_URL}/api/pay/webhooks/nowpayments`
        : undefined;

    // ---------- Payload ----------
    const payload = {
        price_amount: Number(intencion.monto),
        price_currency: 'mxn',          // Precio base en MXN
        pay_currency: red,              // Crypto: usdttrc20, usdcmatic, etc.
        order_id: orderId,
        order_description: `Csariel's Pay | ${intencion.public_token} | ${intencion.descripcion || ''}`.slice(0, 200),
        ipn_callback_url: ipnCallbackUrl,
        is_fixed_rate: false,
        is_fee_paid_by_user: false
    };

    // ---------- Crear payment ----------
    let respuesta;
    try {
        respuesta = await llamarNowPayments('POST', '/payment', payload);
    } catch (errNP) {
        logger.error(`[NOWPayments] Error creando payment: ${errNP.message}`);
        throw errNP;
    }

    if (!respuesta || !respuesta.payment_id) {
        logger.error(`[NOWPayments] Respuesta sin payment_id: ${JSON.stringify(respuesta).slice(0, 300)}`);
        throw errors.errorProveedorErrorTemporal('nowpayments', {
            motivo: 'respuesta_sin_payment_id'
        });
    }

    const paymentId = String(respuesta.payment_id);
    const payAddress = respuesta.pay_address || null;

    // ---------- Guardar en la intención ----------
    const { error: errUpdate } = await supabaseAdmin
        .from('pay_intenciones')
        .update({
            provider_payment_id: paymentId,
            provider_reference: payAddress,
            updated_at: new Date().toISOString()
        })
        .eq('id', intencion.id);

    if (errUpdate) {
        logger.error(`[NOWPayments] Error guardando payment en intención: ${errUpdate.message}`);
        // No lanzamos: el payment ya existe. El webhook lo reconciliará.
    }

    logger.info(
        `[NOWPayments] Payment creado: ${paymentId} ` +
        `para intención ${intencion.id} (${red}, ${intencion.monto} MXN)`
    );

    return {
        provider_payment_id: paymentId,
        provider_reference: payAddress,
        pay_address: payAddress,
        pay_amount: respuesta.pay_amount || null,
        pay_currency: respuesta.pay_currency || red,
        payment_url: respuesta.payment_url || null,
        order_id: orderId,
        reutilizado: false
    };
}

// ================================================================
// PROCESAR WEBHOOK
// ================================================================
// Se llama desde el Core cuando llega un webhook de NOWPayments.
//
// Args:
//   req -> request completo con:
//     - req.body     (ya parseado)
//     - req.rawBody  (capturado por express.json({ verify }))
//     - req.headers  (incluye 'x-nowpayments-sig')
//
// Devuelve:
//   {
//     firma_valida, event_id, tipo_evento, accion,
//     intencion_id, provider_transaction_id, provider_status,
//     provider_fee_mxn, network_fee_mxn, metadata, payload_crudo
//   }
// ================================================================

async function procesarWebhook(req) {
    verificarSupabaseAdmin();

    const body = req.body || {};
    const firma = req.headers['x-nowpayments-sig'] || req.headers['x-signature'];

    // ---------- Verificar firma ----------
    let firmaValida = false;

    if (!NOWPAYMENTS_IPN_SECRET) {
        logger.warning('[NOWPayments] IPN secret no configurado');
    } else if (!firma) {
        logger.warning('[NOWPayments] Webhook sin firma');
    } else if (!verificarFirmaNowPayments) {
        logger.error('[NOWPayments] utils/nowpayments-sig.js no disponible');
    } else {
        try {
            firmaValida = verificarFirmaNowPayments(
                body,
                req.rawBody,
                firma,
                NOWPAYMENTS_IPN_SECRET
            ) === true;
        } catch (errFirma) {
            logger.warning(`[NOWPayments] Error verificando firma: ${errFirma.message}`);
            firmaValida = false;
        }
    }

    if (!firmaValida) {
        return {
            firma_valida: false,
            event_id: null,
            tipo_evento: null,
            accion: 'ignorar',
            intencion_id: null,
            provider_transaction_id: null,
            provider_status: null,
            provider_fee_mxn: 0,
            network_fee_mxn: 0,
            metadata: {},
            payload_crudo: body
        };
    }

    // ---------- Extraer datos ----------
    const paymentId = body.payment_id ? String(body.payment_id) : null;
    const orderId = body.order_id || null;
    const paymentStatus = String(body.payment_status || '').toLowerCase();
    const actuallyPaid = body.actually_paid || null;
    const payAddress = body.pay_address || null;

    // ---------- Identificar intención ----------
    // order_id = "csariels_<uuid>"
    let intencionId = null;

    if (orderId && orderId.startsWith('csariels_')) {
        intencionId = orderId.slice('csariels_'.length);
    }

    // Si no viene en order_id, buscar por provider_payment_id
    if (!intencionId && paymentId) {
        const { data: encontrada } = await supabaseAdmin
            .from('pay_intenciones')
            .select('id')
            .eq('provider_payment_id', paymentId)
            .maybeSingle();

        if (encontrada) {
            intencionId = encontrada.id;
        }
    }

    // ---------- event_id único ----------
    // NOWPayments manda payment_id + payment_status, pero no un event_id
    // por separado. Usamos combinación para idempotencia.
    const eventId = `${paymentId}_${paymentStatus}`;

    // ---------- Determinar acción ----------
    let accion = 'ignorar';
    let providerStatus = paymentStatus;

    if (ESTADOS_CONFIRMADOS.includes(paymentStatus)) {
        if (intencionId) {
            accion = 'confirmar_intencion';
        } else {
            logger.warning(`[NOWPayments] Pago confirmado sin intención mapeable: order_id=${orderId} payment_id=${paymentId}`);
            accion = 'ignorar';
        }
    } else if (ESTADOS_FALLIDOS.includes(paymentStatus)) {
        accion = 'ignorar';
    } else if (ESTADOS_EN_PROCESO.includes(paymentStatus)) {
        accion = 'ignorar';
    }

    // ---------- Comisiones ----------
    // NOWPayments no manda la fee en el IPN estándar. Se calcula
    // después consultando el detalle del payment. Por ahora 0.
    const providerFeeMxn = 0;
    const networkFeeMxn = 0;

    return {
        firma_valida: true,
        event_id: eventId,
        tipo_evento: `payment.${paymentStatus}`,
        accion: accion,
        intencion_id: intencionId,
        provider_transaction_id: paymentId,
        provider_status: providerStatus,
        provider_fee_mxn: providerFeeMxn,
        network_fee_mxn: networkFeeMxn,
        metadata: {
            nowpayments_payment_id: paymentId,
            nowpayments_order_id: orderId,
            nowpayments_status: paymentStatus,
            nowpayments_pay_address: payAddress,
            nowpayments_actually_paid: actuallyPaid,
            nowpayments_pay_currency: body.pay_currency || null,
            nowpayments_price_amount: body.price_amount || null,
            nowpayments_price_currency: body.price_currency || null
        },
        payload_crudo: body
    };
}

// ================================================================
// CONSULTAR ESTADO DE UN PAYMENT (para reconciliación)
// ================================================================
// Útil si el webhook nunca llega (raro, pero pasa).
// Se puede llamar desde un job de reconciliación o desde el router.
// ================================================================

async function consultarPago(paymentId) {
    if (!paymentId) {
        throw errors.errorParametroRequerido('paymentId');
    }

    const respuesta = await llamarNowPayments(
        'GET',
        `/payment/${encodeURIComponent(paymentId)}`,
        null
    );

    return respuesta;
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    crearPago: crearPago,
    procesarWebhook: procesarWebhook,
    consultarPago: consultarPago,

    // Expuesto para testing
    REDES_PERMITIDAS: REDES_PERMITIDAS,
    RED_POR_METODO: RED_POR_METODO
};