// ================================================================
// ROUTES/PAY/STRIPE-CONNECT.JS
// CSARIEL'S PAY - ONBOARDING DE STRIPE CONNECT
// ================================================================
// Endpoints:
//   GET  /api/pay/stripe-connect/estado
//   POST /api/pay/stripe-connect/onboarding
//
// El stripe_account_id se persiste en usuarios.stripe_account_id.
// ================================================================

'use strict';

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');
const errors = require('../../services/pay/errors');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL || '';

let stripeClient = null;

// ================================================================
// CLIENTE STRIPE
// ================================================================

function obtenerCliente() {
    if (!STRIPE_SECRET_KEY) {
        throw errors.errorProveedorNoConfigurado(
            'stripe (falta STRIPE_SECRET_KEY)'
        );
    }

    if (!stripeClient) {
        stripeClient = new Stripe(STRIPE_SECRET_KEY, {
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
// PERSISTIR stripe_account_id EN usuarios
// ================================================================

async function persistirStripeAccountId(usuarioId, stripeAccountId) {
    if (!usuarioId || !stripeAccountId) {
        return;
    }

    if (!supabaseAdmin) {
        logger.error(
            '[Stripe Connect] supabaseAdmin no está disponible'
        );
        return;
    }

    try {
        const { data: usuarioActual, error: errSelect } =
            await supabaseAdmin
                .from('usuarios')
                .select('stripe_account_id')
                .eq('id', usuarioId)
                .maybeSingle();

        if (errSelect) {
            logger.error(
                `[Stripe Connect] Error consultando stripe_account_id: ${errSelect.message}`
            );
            return;
        }

        if (
            usuarioActual &&
            usuarioActual.stripe_account_id === stripeAccountId
        ) {
            return;
        }

        const { error: errUpd } =
            await supabaseAdmin
                .from('usuarios')
                .update({
                    stripe_account_id: stripeAccountId
                })
                .eq('id', usuarioId);

        if (errUpd) {
            logger.error(
                `[Stripe Connect] Error guardando stripe_account_id: ${errUpd.message}`
            );
            return;
        }

        logger.info(
            `[Stripe Connect] stripe_account_id guardado para usuario ${usuarioId}`
        );
    } catch (err) {
        logger.error(
            `[Stripe Connect] Excepción guardando stripe_account_id: ${err.message}`
        );
    }
}

// ================================================================
// OBTENER stripe_account_id GUARDADO
// ================================================================

async function obtenerStripeAccountIdGuardado(usuarioId) {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado(
            'supabase (cliente admin no disponible)'
        );
    }

    const { data, error } =
        await supabaseAdmin
            .from('usuarios')
            .select('stripe_account_id')
            .eq('id', usuarioId)
            .maybeSingle();

    if (error) {
        logger.error(
            `[Stripe Connect] Error obteniendo cuenta guardada: ${error.message}`
        );

        throw errors.errorProveedorErrorTemporal(
            'supabase',
            {
                motivo: error.message
            }
        );
    }

    return data && data.stripe_account_id
        ? data.stripe_account_id
        : null;
}

// ================================================================
// RESOLVER CUENTA CONNECT DEL USUARIO
// ================================================================

async function resolverOCrearCuentaConnect(usuario) {
    if (!usuario || !usuario.id) {
        throw errors.errorParametroRequerido('usuario');
    }

    if (!usuario.email) {
        throw errors.errorParametroRequerido(
            'email del usuario'
        );
    }

    const stripe = obtenerCliente();

    // ------------------------------------------------------------
    // 1) PRIORIDAD ABSOLUTA:
    //    stripe_account_id GUARDADO EN SUPABASE
    // ------------------------------------------------------------

    const stripeAccountIdGuardado =
        await obtenerStripeAccountIdGuardado(usuario.id);

    if (stripeAccountIdGuardado) {
        try {
            const cuentaGuardada =
                await stripe.accounts.retrieve(
                    stripeAccountIdGuardado
                );

            return cuentaGuardada;
        } catch (errRetrieve) {
            logger.warn(
                `[Stripe Connect] La cuenta guardada ${stripeAccountIdGuardado} no pudo recuperarse: ${errRetrieve.message}`
            );

            // No eliminamos ni sobrescribimos automáticamente
            // el ID guardado. Continuamos con la recuperación
            // por email.
        }
    }

    // ------------------------------------------------------------
    // 2) RECUPERACIÓN POR EMAIL
    // ------------------------------------------------------------

    let cuentaExistente = null;

    try {
        const lista = await stripe.accounts.list({
            email: usuario.email,
            limit: 1
        });

        if (
            lista &&
            Array.isArray(lista.data) &&
            lista.data.length > 0
        ) {
            cuentaExistente = lista.data[0];
        }
    } catch (errList) {
        logger.warn(
            `[Stripe Connect] Error buscando cuenta por email: ${errList.message}`
        );
    }

    if (cuentaExistente) {
        await persistirStripeAccountId(
            usuario.id,
            cuentaExistente.id
        );

        return cuentaExistente;
    }

    // ------------------------------------------------------------
    // 3) CREAR NUEVA CUENTA CONNECT EXPRESS
    // ------------------------------------------------------------

    let nuevaCuenta;

    try {
        nuevaCuenta = await stripe.accounts.create({
            type: 'express',
            email: usuario.email,
            country: 'MX',
            business_type: 'individual',

            capabilities: {
                transfers: {
                    requested: true
                },
                card_payments: {
                    requested: true
                }
            },

            settings: {
                payouts: {
                    schedule: {
                        interval: 'manual'
                    }
                }
            },

            metadata: {
                csariels_usuario_id: String(usuario.id),
                csariels_created_from:
                    'csariels_pay_onboarding'
            }
        });
    } catch (errCreate) {
        logger.error(
            `[Stripe Connect] Error creando cuenta Connect: ${errCreate.message}`
        );

        if (
            errCreate.type ===
            'StripeInvalidRequestError'
        ) {
            throw errors.errorProveedorRechazo(
                'stripe',
                errCreate.message,
                {
                    codigo: errCreate.code || null,
                    parametro: errCreate.param || null
                }
            );
        }

        if (
            errCreate.type ===
                'StripeConnectionError' ||
            errCreate.type ===
                'StripeAPIError' ||
            errCreate.type ===
                'StripeRateLimitError'
        ) {
            throw errors.errorProveedorErrorTemporal(
                'stripe',
                {
                    motivo: errCreate.message,
                    tipo: errCreate.type
                }
            );
        }

        throw errors.errorProveedorRechazo(
            'stripe',
            errCreate.message,
            {
                codigo: errCreate.code || null
            }
        );
    }

    logger.info(
        `[Stripe Connect] Cuenta Connect creada: ${nuevaCuenta.id}`
    );

    // Guardar inmediatamente el acct_.
    await persistirStripeAccountId(
        usuario.id,
        nuevaCuenta.id
    );

    return nuevaCuenta;
}

// ================================================================
// VALIDAR PUBLIC_URL PARA STRIPE
// ================================================================

function obtenerUrlsOnboarding() {
    if (!PUBLIC_URL) {
        throw errors.errorProveedorNoConfigurado(
            'stripe (falta PUBLIC_URL)'
        );
    }

    let base;

    try {
        base = new URL(PUBLIC_URL);
    } catch (err) {
        throw errors.errorProveedorNoConfigurado(
            'stripe (PUBLIC_URL inválida)'
        );
    }

    if (
        base.protocol !== 'http:' &&
        base.protocol !== 'https:'
    ) {
        throw errors.errorProveedorNoConfigurado(
            'stripe (PUBLIC_URL debe usar http o https)'
        );
    }

    const baseLimpia =
        PUBLIC_URL.replace(/\/+$/, '');

    return {
        refreshUrl:
            `${baseLimpia}/features/pay/vincular-stripe.html?estado=refrescar`,

        returnUrl:
            `${baseLimpia}/features/pay/vincular-stripe.html?estado=listo`
    };
}

// ================================================================
// GET /api/pay/stripe-connect/estado
// ================================================================

router.get(
    '/estado',
    verificarToken,
    async function (req, res) {
        try {
            const usuario = req.usuario;

            if (!usuario || !usuario.id) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            // ----------------------------------------------------
            // 1) Buscar primero en Supabase
            // ----------------------------------------------------

            let stripeAccountId =
                await obtenerStripeAccountIdGuardado(
                    usuario.id
                );

            const stripe = obtenerCliente();

            // ----------------------------------------------------
            // 2) Recuperación por email si falta el ID
            // ----------------------------------------------------

            if (
                !stripeAccountId &&
                usuario.email
            ) {
                try {
                    const lista =
                        await stripe.accounts.list({
                            email: usuario.email,
                            limit: 1
                        });

                    if (
                        lista &&
                        Array.isArray(lista.data) &&
                        lista.data.length > 0
                    ) {
                        stripeAccountId =
                            lista.data[0].id;

                        await persistirStripeAccountId(
                            usuario.id,
                            stripeAccountId
                        );
                    }
                } catch (errList) {
                    logger.warn(
                        `[Stripe Connect] Error consultando por email: ${errList.message}`
                    );
                }
            }

            // ----------------------------------------------------
            // 3) No existe cuenta vinculada
            // ----------------------------------------------------

            if (!stripeAccountId) {
                return res.status(200).json({
                    success: true,
                    data: {
                        vinculada: false,
                        habilitada: false,
                        mensaje:
                            'Aún no has vinculado tu cuenta de Stripe para retiros por tarjeta.'
                    }
                });
            }

            // ----------------------------------------------------
            // 4) Consultar estado real en Stripe
            // ----------------------------------------------------

            let cuentaCompleta;

            try {
                cuentaCompleta =
                    await stripe.accounts.retrieve(
                        stripeAccountId
                    );
            } catch (errRetrieve) {
                logger.warn(
                    `[Stripe Connect] Error obteniendo cuenta ${stripeAccountId}: ${errRetrieve.message}`
                );

                return res.status(200).json({
                    success: true,
                    data: {
                        vinculada: true,
                        habilitada: false,
                        stripe_account_id:
                            stripeAccountId,
                        mensaje:
                            'No se pudo consultar el estado de tu cuenta. Reintenta en un momento.'
                    }
                });
            }

            const payoutsEnabled =
                cuentaCompleta.payouts_enabled === true;

            const chargesEnabled =
                cuentaCompleta.charges_enabled === true;

            const detailsSubmitted =
                cuentaCompleta.details_submitted === true;

            const habilitada =
                payoutsEnabled &&
                chargesEnabled;

            const requirementsPendientes =
                cuentaCompleta.requirements &&
                Array.isArray(
                    cuentaCompleta.requirements.currently_due
                )
                    ? cuentaCompleta.requirements.currently_due
                    : [];

            return res.status(200).json({
                success: true,
                data: {
                    vinculada: true,
                    habilitada: habilitada,

                    payouts_enabled:
                        payoutsEnabled,

                    charges_enabled:
                        chargesEnabled,

                    details_submitted:
                        detailsSubmitted,

                    pais:
                        cuentaCompleta.country || null,

                    moneda_default:
                        cuentaCompleta.default_currency ||
                        null,

                    stripe_account_id:
                        stripeAccountId,

                    requirements_pendientes:
                        requirementsPendientes,

                    mensaje: habilitada
                        ? 'Tu cuenta de Stripe está lista para recibir retiros por tarjeta.'
                        : 'Tu cuenta de Stripe aún necesita información. Continúa el proceso de verificación.'
                }
            });

        } catch (err) {
            logger.error(
                `[Stripe Connect] Error en estado: ${err.message}`
            );

            return errors.responderError(
                res,
                err
            );
        }
    }
);

// ================================================================
// POST /api/pay/stripe-connect/onboarding
// ================================================================

router.post(
    '/onboarding',
    verificarToken,
    async function (req, res) {
        try {
            const usuario = req.usuario;

            if (!usuario || !usuario.id) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autenticado'
                });
            }

            // ----------------------------------------------------
            // Resolver o crear cuenta Connect
            // ----------------------------------------------------

            const cuenta =
                await resolverOCrearCuentaConnect(
                    usuario
                );

            const stripe =
                obtenerCliente();

            // ----------------------------------------------------
            // URLs de retorno
            // ----------------------------------------------------

            const {
                refreshUrl,
                returnUrl
            } = obtenerUrlsOnboarding();

            // ----------------------------------------------------
            // Crear Account Link
            // ----------------------------------------------------

            let accountLink;

            try {
                accountLink =
                    await stripe.accountLinks.create({
                        account: cuenta.id,
                        refresh_url: refreshUrl,
                        return_url: returnUrl,
                        type: 'account_onboarding',
                        collect: 'currently_due'
                    });
            } catch (errLink) {
                logger.error(
                    `[Stripe Connect] Error creando Account Link: ${errLink.message}`
                );

                if (
                    errLink.type ===
                        'StripeInvalidRequestError'
                ) {
                    throw errors.errorProveedorRechazo(
                        'stripe',
                        errLink.message,
                        {
                            codigo:
                                errLink.code ||
                                null,
                            parametro:
                                errLink.param ||
                                null
                        }
                    );
                }

                throw errors.errorProveedorErrorTemporal(
                    'stripe',
                    {
                        motivo:
                            errLink.message,
                        tipo:
                            errLink.type ||
                            null
                    }
                );
            }

            logger.info(
                `[Stripe Connect] Account Link generado para ${usuario.email}`
            );

            return res.status(200).json({
                success: true,
                data: {
                    url: accountLink.url,

                    expires_at:
                        accountLink.expires_at,

                    account_id:
                        cuenta.id
                }
            });

        } catch (err) {
            logger.error(
                `[Stripe Connect] Error en onboarding: ${err.message}`
            );

            return errors.responderError(
                res,
                err
            );
        }
    }
);

// ================================================================
// EXPORTAR ROUTER
// ================================================================

module.exports = router;