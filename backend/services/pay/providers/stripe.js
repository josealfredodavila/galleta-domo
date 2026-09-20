// ================================================================
// SERVICES/PAY/PROVIDERS/STRIPE.JS
// CSARIEL'S PAY - ADAPTER DE STRIPE (TARJETA)
// ================================================================
// Encapsula toda la comunicación con Stripe.
//
// El Core NO habla con Stripe directamente. El Core llama:
//   - crearPago(intencion)          -> crea PaymentIntent
//   - procesarWebhook(req)          -> verifica firma + extrae datos
//
// Este adapter NO toca las tablas pay_* para actualizar estados
// de pago. Solo:
//   - Al crear PaymentIntent: guarda provider_payment_id en la intención.
//   - Al procesar webhook: devuelve la acción al Core.
//
// La confirmación final (estado 'paid' + movimientos) la hace
// el Core vía pay_confirmar_intencion.
// ================================================================

'use strict';

const Stripe = require('stripe');

const { supabaseAdmin } = require('../../../config/supabase');
const logger = require('../../../utils/logger');
const errors = require('../errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Mapeo de moneda interna -> moneda Stripe
// Stripe usa ISO 4217 en minúsculas.
const MONEDA_STRIPE = {
    MXN: 'mxn',
    USD: 'usd',
    COP: 'cop',
    CLP: 'clp',
    ARS: 'ars',
    PEN: 'pen'
};

// País -> moneda local para Stripe
const MONEDA_POR_PAIS = {
    MX: 'mxn',
    CO: 'cop',
    CL: 'clp',
    AR: 'ars',
    PE: 'pen',
    EC: 'usd'
};

// Tipos de evento que nos importan
const EVENTOS_RELEVANTES = [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.refunded'
];

// ================================================================
// CLIENTE STRIPE
// ================================================================

let stripeClient = null;

function obtenerCliente() {
    if (!STRIPE_SECRET_KEY) {
        throw errors.errorProveedorNoConfigurado('stripe');
    }

    if (!stripeClient) {
        stripeClient = new Stripe(STRIPE_SECRET_KEY, {
            // No fijamos apiVersion: usamos la configurada en la cuenta.
            // Si en el futuro quieres pinchar una versión, la pones aquí.
            timeout: 20000,
            maxNetworkRetries: 2,
            appInfo: {
                name: 'Csariels Pay',
                version: '1.0.0'
            }
        });
    }

    return stripeClient;
}

// ================================================================
// HELPERS
// ================================================================

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

function montoACentavos(monto, monedaStripe) {
    // Stripe usa la unidad más pequeña de la moneda.
    // En la mayoría de monedas, es 1/100 (centavos).
    // En CLP (Chile) NO hay decimales: es unidad entera.
    // En USD, MXN, COP, ARS, PEN sí.
    if (monedaStripe === 'clp') {
        return Math.round(Number(monto));
    }
    return Math.round(Number(monto) * 100);
}

function monedaParaStripe(codigoPais, monedaInterna) {
    // Si la moneda interna es MXN (tarjeta), usamos MXN.
    // Si no, derivamos por país.
    if (monedaInterna && MONEDA_STRIPE[monedaInterna]) {
        return MONEDA_STRIPE[monedaInterna];
    }
    return MONEDA_POR_PAIS[codigoPais] || 'mxn';
}

// ================================================================
// CREAR PAGO (PaymentIntent)
// ================================================================
// Se llama desde el Core cuando un comprador elige 'tarjeta' y hay
// que generar el PaymentIntent para que el frontend lo confirme.
//
// Args:
//   intencion -> fila de pay_intenciones (ya creada)
//
// Devuelve:
//   {
//     provider_payment_id: 'pi_...',
//     provider_reference: 'pi_..._secret_...',   // client_secret
//     client_secret: 'pi_..._secret_...',
//     publishable_key_configurada: boolean
//   }
// ================================================================

async function crearPago(intencion) {
    verificarSupabaseAdmin();

    if (!intencion || !intencion.id) {
        throw errors.errorParametroRequerido('intencion');
    }

    const stripe = obtenerCliente();

    // El país lo leemos del metadata de la intención, que puso el Core.
    const codigoPais = (intencion.metadata && intencion.metadata.pais) || 'MX';
    const monedaStripe = monedaParaStripe(codigoPais, intencion.moneda);

    const montoCentavos = montoACentavos(intencion.monto, monedaStripe);

    if (montoCentavos <= 0) {
        throw errors.errorMontoInvalido({ monto: intencion.monto });
    }

    // Idempotency key: usamos el public_token para que Stripe no
    // cree dos PaymentIntents si el frontend reintenta la llamada.
    const idempotencyKey = `pi_${intencion.public_token}`;

    let paymentIntent;
    try {
        paymentIntent = await stripe.paymentIntents.create(
            {
                amount: montoCentavos,
                currency: monedaStripe,
                automatic_payment_methods: { enabled: true },
                description: intencion.descripcion || `Csariel's Pay ${intencion.public_token}`,
                metadata: {
                    csariels_intencion_id: intencion.id,
                    csariels_public_token: intencion.public_token,
                    csariels_pedido_id: intencion.pedido_id ? String(intencion.pedido_id) : '',
                    csariels_pais: codigoPais,
                    csariels_metodo: 'tarjeta'
                },
                receipt_email: null
            },
            {
                idempotencyKey: idempotencyKey
            }
        );
    } catch (errStripe) {
        logger.error(`[Stripe] Error creando PaymentIntent: ${errStripe.message}`);

        // Errores de Stripe que son de validación (monto muy bajo, etc.)
        if (errStripe.type === 'StripeInvalidRequestError') {
            throw errors.errorProveedorRechazo('stripe', errStripe.message, {
                codigo_stripe: errStripe.code || null
            });
        }

        // Errores temporales (timeout, red, rate limit)
        if (errStripe.type === 'StripeAPIError' ||
            errStripe.type === 'StripeConnectionError' ||
            errStripe.type === 'StripeRateLimitError') {
            throw errors.errorProveedorErrorTemporal('stripe', {
                codigo_stripe: errStripe.code || null,
                tipo_stripe: errStripe.type
            });
        }

        // Otros errores de Stripe
        throw errors.errorProveedorRechazo('stripe', errStripe.message, {
            codigo_stripe: errStripe.code || null,
            tipo_stripe: errStripe.type || null
        });
    }

    // Guardar en la intención los identificadores del proveedor.
    // No actualizamos el estado: sigue 'pending'. El estado 'paid'
    // viene por el webhook cuando Stripe confirma.
    const { error: errUpdate } = await supabaseAdmin
        .from('pay_intenciones')
        .update({
            provider_payment_id: paymentIntent.id,
            provider_reference: paymentIntent.client_secret || null,
            updated_at: new Date().toISOString()
        })
        .eq('id', intencion.id);

    if (errUpdate) {
        logger.error(`[Stripe] Error guardando provider_payment_id: ${errUpdate.message}`);
        // No lanzamos error: el PaymentIntent ya existe y el webhook
        // lo reconciliará. Solo dejamos constancia.
    }

    logger.info(
        `[Stripe] PaymentIntent creado: ${paymentIntent.id} ` +
        `para intención ${intencion.id} (${monedaStripe} ${intencion.monto})`
    );

    return {
        provider_payment_id: paymentIntent.id,
        provider_reference: paymentIntent.client_secret || null,
        client_secret: paymentIntent.client_secret || null,
        moneda_stripe: monedaStripe,
        monto_centavos: montoCentavos,
        publishable_key_configurada: Boolean(process.env.STRIPE_PUBLISHABLE_KEY)
    };
}

// ================================================================
// PROCESAR WEBHOOK
// ================================================================
// Se llama desde el Core cuando llega un webhook de Stripe.
//
// Args:
//   req -> request completo con:
//     - req.body     (ya parseado por express.json)
//     - req.rawBody  (capturado por el verify de express.json en server.js)
//     - req.headers  (incluye 'stripe-signature')
//
// Devuelve:
//   {
//     firma_valida: boolean,
//     event_id: string,
//     tipo_evento: string,
//     accion: 'confirmar_intencion' | 'ignorar',
//     intencion_id: uuid | null,
//     provider_transaction_id: string | null,
//     provider_status: string | null,
//     provider_fee_mxn: number,
//     network_fee_mxn: number,
//     metadata: object,
//     payload_crudo: object
//   }
// ================================================================

async function procesarWebhook(req) {
    verificarSupabaseAdmin();

    if (!STRIPE_WEBHOOK_SECRET) {
        throw errors.errorProveedorNoConfigurado('stripe (falta STRIPE_WEBHOOK_SECRET)');
    }

    const firma = req.headers['stripe-signature'];
    const rawBody = req.rawBody;
    const body = req.body;

    // ---------- Verificar firma ----------
    if (!firma || !rawBody) {
        logger.warning('[Stripe] Webhook sin firma o sin rawBody');
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
            payload_crudo: body || {}
        };
    }

    const stripe = obtenerCliente();

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            rawBody,
            firma,
            STRIPE_WEBHOOK_SECRET
        );
    } catch (errFirma) {
        logger.warning(`[Stripe] Firma inválida: ${errFirma.message}`);
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
            payload_crudo: body || {}
        };
    }

    // ---------- Verificar tipo de evento ----------
    const tipoEvento = event.type;

    if (!EVENTOS_RELEVANTES.includes(tipoEvento)) {
        return {
            firma_valida: true,
            event_id: event.id,
            tipo_evento: tipoEvento,
            accion: 'ignorar',
            intencion_id: null,
            provider_transaction_id: null,
            provider_status: null,
            provider_fee_mxn: 0,
            network_fee_mxn: 0,
            metadata: {},
            payload_crudo: event
        };
    }

    // ---------- Extraer datos del evento ----------
    const objeto = event.data && event.data.object ? event.data.object : {};
    const metadata = objeto.metadata || {};
    const intencionId = metadata.csariels_intencion_id || null;
    const providerPaymentId = objeto.id || null;

    // ---------- Determinar acción ----------
    let accion = 'ignorar';
    let providerStatus = null;

    switch (tipoEvento) {
        case 'payment_intent.succeeded':
            accion = 'confirmar_intencion';
            providerStatus = 'succeeded';
            break;

        case 'payment_intent.payment_failed':
            // No confirmamos. El Core registrará el evento pero no
            // marcará la intención como pagada. Si quieres marcar
            // la intención como failed, es otra RPC (a futuro).
            accion = 'ignorar';
            providerStatus = 'payment_failed';
            break;

        case 'payment_intent.canceled':
            accion = 'ignorar';
            providerStatus = 'canceled';
            break;

        case 'charge.refunded':
            accion = 'ignorar';
            providerStatus = 'refunded';
            break;

        default:
            accion = 'ignorar';
            providerStatus = tipoEvento;
    }

    // ---------- Comisión de Stripe ----------
    // Stripe no la manda en el payment_intent.succeeded directamente.
    // Se calcula después con la balance_transaction, o se asume 0
    // y se reconcilia más tarde. Por ahora 0.
    const providerFeeMxn = 0;
    const networkFeeMxn = 0;

    return {
        firma_valida: true,
        event_id: event.id,
        tipo_evento: tipoEvento,
        accion: accion,
        intencion_id: intencionId,
        provider_transaction_id: providerPaymentId,
        provider_status: providerStatus,
        provider_fee_mxn: providerFeeMxn,
        network_fee_mxn: networkFeeMxn,
        metadata: {
            stripe_event_id: event.id,
            stripe_payment_intent_id: providerPaymentId,
            stripe_amount: objeto.amount || null,
            stripe_currency: objeto.currency || null,
            stripe_status: objeto.status || null
        },
        payload_crudo: event
    };
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    crearPago: crearPago,
    procesarWebhook: procesarWebhook
};