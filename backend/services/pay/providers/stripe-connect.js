// ================================================================
// SERVICES/PAY/PROVIDERS/STRIPE-CONNECT.JS
// CSARIEL'S PAY - ADAPTER DE STRIPE CONNECT (RETIROS POR TARJETA)
// ================================================================
// Implementa crearPayout(retiro) para retiros por tarjeta usando
// Stripe Connect.
//
// Requisitos:
//   - Cuenta Stripe con Connect habilitado.
//   - Cuenta Connect Express (o Standard) creada por cada vendedor.
//   - stripe_account_id guardado (ver nota abajo).
//
// Flujo:
//   retiros.js solicita retiro -> pay_reservar_retiro (reserva saldo)
//   -> stripe-connect.crearPayout(retiro)
//     -> stripe.transfers.create() (o stripe.payouts.create() si Connect
//        está en modo Standard y el vendedor tiene su propia cuenta)
//   -> retiro queda en 'processing' con provider_transfer_id
//   -> webhook transfer.paid / payout.paid -> pay_cerrar_retiro
//
// NOTA sobre stripe_account_id:
//   Este adapter NO crea ni persiste cuentas Connect. Solo usa una ya
//   existente. El stripe_account_id viene de:
//     1. retiro.provider_destination_id (si ya hay uno)
//     2. el último retiro completado del mismo usuario
//     3. datosExtra.stripe_account_id en el request original
//
//   Si no se encuentra, el adapter falla con STRIPE_ACCOUNT_NO_VINCULADA.
//
// Documentación: https://stripe.com/docs/connect
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

// Tipo de payout por defecto:
//   'standard'  -> llega en 2-3 días hábiles (sin costo extra)
//   'instant'   -> llega en minutos (costo ~1%)
//   'manual'    -> se dispara desde el dashboard
const STRIPE_PAYOUT_METHOD = process.env.STRIPE_PAYOUT_METHOD || 'standard';

// Tiempo de espera máximo por respuesta de Stripe
const STRIPE_TIMEOUT_MS = 20000;

// ================================================================
// CLIENTE STRIPE
// ================================================================

let stripeClient = null;

function obtenerCliente() {
    if (!STRIPE_SECRET_KEY) {
        throw errors.errorProveedorNoConfigurado('stripe-connect (falta STRIPE_SECRET_KEY)');
    }

    if (!stripeClient) {
        stripeClient = new Stripe(STRIPE_SECRET_KEY, {
            timeout: STRIPE_TIMEOUT_MS,
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

/**
 * Busca un stripe_account_id asociado al usuario.
 *
 * Orden de búsqueda:
 *   1. El retiro actual (si ya tiene provider_destination_id de un intento previo)
 *   2. Último retiro completado del mismo usuario con metadata.stripe_account_id
 *   3. datosExtra del retiro actual (metadata.stripe_account_id)
 */
async function resolverStripeAccountId(retiro) {
    // 1) Del propio retiro (si ya lo tenía)
    if (retiro.provider_destination_id && String(retiro.provider_destination_id).startsWith('acct_')) {
        return retiro.provider_destination_id;
    }

    // 2) De metadata del retiro
    if (retiro.metadata && retiro.metadata.stripe_account_id) {
        return retiro.metadata.stripe_account_id;
    }

    // 3) Del último retiro del mismo usuario con metadata.stripe_account_id
    const { data: ultimo } = await supabaseAdmin
        .from('pay_retiros')
        .select('provider_destination_id, metadata')
        .eq('cuenta_id', retiro.cuenta_id)
        .not('provider_destination_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (ultimo) {
        if (ultimo.provider_destination_id && String(ultimo.provider_destination_id).startsWith('acct_')) {
            return ultimo.provider_destination_id;
        }

        if (ultimo.metadata && ultimo.metadata.stripe_account_id) {
            return ultimo.metadata.stripe_account_id;
        }
    }

    return null;
}

/**
 * Valida los datos mínimos para crear un payout con Stripe Connect.
 */
function validarRetiro(retiro) {
    if (!retiro || !retiro.id) {
        throw errors.errorParametroRequerido('retiro');
    }

    const monto = Number(retiro.monto_mxn);
    if (!Number.isFinite(monto) || monto <= 0) {
        throw errors.errorMontoInvalido();
    }

    if (retiro.metodo !== 'tarjeta') {
        throw errors.errorMetodoInvalido(retiro.metodo);
    }
}

/**
 * Convierte MXN a centavos (Stripe usa la unidad mínima).
 */
function montoACentavos(monto) {
    return Math.round(Number(monto) * 100);
}

// ================================================================
// CREAR PAYOUT (Transfer a cuenta Connect)
// ================================================================
// Args:
//   retiro -> fila de pay_retiros con:
//     id, monto_mxn, metodo ('tarjeta'), cuenta_id,
//     provider_destination_id (opcional), metadata
//
// Devuelve:
//   {
//     provider_transfer_id: 'tr_...',
//     provider_status: 'pending' | 'in_transit' | 'paid',
//     estado_inmediato: 'processing' | 'completed',
//     provider_destination_id: 'acct_...',
//     metadata: {...}
//   }
// ================================================================

async function crearPayout(retiro) {
    verificarSupabaseAdmin();
    validarRetiro(retiro);

    const stripe = obtenerCliente();

    // ---------- 1) Resolver cuenta Connect ----------
    const stripeAccountId = await resolverStripeAccountId(retiro);

    if (!stripeAccountId) {
        throw errors.errorDestinoRetiroInvalido({
            motivo: 'No hay cuenta de Stripe Connect vinculada. ' +
                    'El vendedor debe completar el onboarding de Stripe Connect primero.'
        });
    }

    // Validar que la cuenta exista y esté habilitada
    let cuentaConnect;
    try {
        cuentaConnect = await stripe.accounts.retrieve(stripeAccountId);
    } catch (errStripe) {
        logger.error(`[Stripe Connect] Error obteniendo cuenta ${stripeAccountId}: ${errStripe.message}`);

        if (errStripe.code === 'account_invalid') {
            throw errors.errorProveedorRechazo('stripe-connect', 'Cuenta Connect inválida o inexistente', {
                cuenta: stripeAccountId
            });
        }

        throw errors.errorProveedorErrorTemporal('stripe-connect', {
            motivo: errStripe.message
        });
    }

    if (!cuentaConnect.payouts_enabled && !cuentaConnect.charges_enabled) {
        throw errors.errorProveedorRechazo('stripe-connect',
            'La cuenta de Stripe Connect no está habilitada para recibir pagos. ' +
            'El vendedor debe completar el onboarding y verificación.',
            { cuenta: stripeAccountId }
        );
    }

    // ---------- 2) Calcular monto en centavos ----------
    const montoCentavos = montoACentavos(retiro.monto_mxn);

    if (montoCentavos <= 0) {
        throw errors.errorMontoInvalido({ monto: retiro.monto_mxn });
    }

    // ---------- 3) Crear Transfer ----------
    // El Transfer mueve dinero de la cuenta de plataforma a la cuenta Connect.
    // Luego Stripe se encarga de hacer el payout a la cuenta bancaria del
    // vendedor según el payout schedule configurado.
    const idempotencyKey = `tr_retiro_${retiro.id}`;

    let transfer;
    try {
        transfer = await stripe.transfers.create(
            {
                amount: montoCentavos,
                currency: 'mxn',
                destination: stripeAccountId,
                description: `Retiro Csariel's Pay #${String(retiro.id).slice(0, 8)}`,
                metadata: {
                    csariels_retiro_id: retiro.id,
                    csariels_cuenta_id: retiro.cuenta_id,
                    csariels_monto_mxn: String(retiro.monto_mxn)
                }
            },
            {
                idempotencyKey: idempotencyKey
            }
        );
    } catch (errStripe) {
        logger.error(`[Stripe Connect] Error creando Transfer: ${errStripe.message}`);

        // Errores de validación: no reintentar
        if (errStripe.type === 'StripeInvalidRequestError') {
            throw errors.errorProveedorRechazo('stripe-connect', errStripe.message, {
                codigo: errStripe.code || null,
                parametro: errStripe.param || null
            });
        }

        // Errores temporales: reintentar
        if (
            errStripe.type === 'StripeAPIError' ||
            errStripe.type === 'StripeConnectionError' ||
            errStripe.type === 'StripeRateLimitError'
        ) {
            throw errors.errorProveedorErrorTemporal('stripe-connect', {
                codigo: errStripe.code || null,
                tipo: errStripe.type
            });
        }

        // Error desconocido: no reintentar
        throw errors.errorProveedorRechazo('stripe-connect', errStripe.message, {
            codigo: errStripe.code || null,
            tipo: errStripe.type || null
        });
    }

    // ---------- 4) Determinar estado inmediato ----------
    // Un Transfer exitoso significa que el dinero ya está en la cuenta
    // Connect del vendedor. El payout a su banco ocurrirá según el schedule
    // de Stripe (normalmente 2-7 días). Ese payout manda webhooks.
    //
    // Para nuestra app, consideramos el retiro como "processing" desde el
    // momento en que el Transfer se crea. Cuando Stripe manda transfer.paid
    // (no aplica al transfer, sino al payout) o payout.paid, cerramos.
    let estadoInmediato = 'processing';

    // Si Stripe ya nos dice que el transfer está completado (raro en creación),
    // lo marcamos como completado. Normalmente siempre es 'processing'.
    if (transfer && transfer.reversed === false) {
        estadoInmediato = 'processing';
    }

    logger.info(
        `[Stripe Connect] Transfer creado: ${transfer.id} ` +
        `para retiro ${retiro.id} (${retiro.monto_mxn} MXN → ${stripeAccountId})`
    );

    return {
        provider_transfer_id: transfer.id,
        provider_status: 'pending',
        estado_inmediato: estadoInmediato,
        provider_destination_id: stripeAccountId,
        metadata: {
            stripe_transfer_id: transfer.id,
            stripe_account_id: stripeAccountId,
            stripe_amount_centavos: montoCentavos,
            stripe_currency: 'mxn',
            stripe_payout_method: STRIPE_PAYOUT_METHOD
        }
    };
}

// ================================================================
// CONSULTAR TRANSFER (para reconciliación)
// ================================================================

async function consultarTransfer(transferId) {
    if (!transferId) {
        throw errors.errorParametroRequerido('transferId');
    }

    const stripe = obtenerCliente();
    return stripe.transfers.retrieve(transferId);
}

// ================================================================
// CONSULTAR PAYOUT (para reconciliación del envío al banco)
// ================================================================

async function consultarPayout(stripeAccountId, payoutId) {
    if (!stripeAccountId || !payoutId) {
        throw errors.errorParametroRequerido('stripeAccountId y payoutId');
    }

    const stripe = obtenerCliente();
    return stripe.payouts.retrieve(payoutId, {
        stripeAccount: stripeAccountId
    });
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    crearPayout: crearPayout,
    consultarTransfer: consultarTransfer,
    consultarPayout: consultarPayout,

    // Para uso interno de tests
    resolverStripeAccountId: resolverStripeAccountId
};