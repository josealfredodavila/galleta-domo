// ================================================================
// ROUTES/PAY/RETIROS.JS
// CSARIEL'S PAY - ROUTER DE RETIROS
// ================================================================
// Endpoints:
//   POST /api/pay/retiros                    (privado)
//   GET  /api/pay/retiros                    (privado)
//   GET  /api/pay/retiros/metodos-disponibles (privado)
//   GET  /api/pay/retiros/:id                (privado)
//
// Todos privados. Ownership siempre verificado.
// La cuenta del usuario se resuelve automáticamente desde el token.
//
// El estado 'completed'/'failed' de un retiro SOLO se marca por
// webhook del proveedor (o por cierre del propio servicio).
// Este router NUNCA marca un retiro como completado.
// ================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');

const retirosService = require('../../services/pay/retiros');
const paises = require('../../services/pay/geo/paises');
const errors = require('../../services/pay/errors');

// ================================================================
// HELPERS INTERNOS
// ================================================================

/**
 * Resuelve la cuenta Pay del usuario autenticado.
 * Devuelve null si no tiene.
 */
async function resolverCuentaDelUsuario(usuarioId) {
    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, tipo, estado, tienda_id, repartidor_id, moneda_principal')
        .eq('usuario_id', usuarioId)
        .eq('estado', 'activa')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Retiros] Error resolviendo cuenta: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return data || null;
}

/**
 * Genera una idempotency_key si el cliente no la mandó.
 */
function generarIdempotencyKey(usuarioId) {
    const random = crypto.randomBytes(8).toString('hex');
    return `retiro-${usuarioId}-${Date.now()}-${random}`;
}

/**
 * Determina si un proveedor está configurado en este entorno.
 */
function proveedorConfigurado(proveedor) {
    if (proveedor === 'stripe') {
        return Boolean(process.env.STRIPE_SECRET_KEY);
    }
    if (proveedor === 'fintoc') {
        return Boolean(process.env.FINTOC_SECRET_KEY);
    }
    if (proveedor === 'nowpayments') {
        return Boolean(process.env.NOWPAYMENTS_API_KEY);
    }
    return false;
}

/**
 * Verifica si el adapter de payout está implementado en disco.
 * (No lo carga, solo verifica existencia del módulo.)
 */
function adapterPayoutImplementado(proveedor) {
    try {
        if (proveedor === 'stripe') {
            require.resolve('../../services/pay/providers/stripe-connect');
            return true;
        }
        const modPath = `../../services/pay/providers/${proveedor}`;
        const mod = require(modPath);
        return typeof mod.crearPayout === 'function';
    } catch (err) {
        return false;
    }
}

// ================================================================
// GET /api/pay/retiros/metodos-disponibles
// PRIVADO - ¿Qué métodos puede usar este usuario AHORA MISMO?
// ================================================================

router.get(
    '/metodos-disponibles',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        tiene_cuenta: false,
                        metodos: []
                    }
                });
            }

            // País del usuario (por ahora MX por defecto)
            const codigoPais = 'MX';

            const pais = paises.obtenerPais(codigoPais);

            if (!pais) {
                return res.status(200).json({
                    success: true,
                    data: {
                        tiene_cuenta: true,
                        pais: codigoPais,
                        metodos: []
                    }
                });
            }

            // Analizar cada método posible en el país
            const metodosPosibles = [
                { metodo: 'crypto', proveedor: 'nowpayments' },
                { metodo: 'spei', proveedor: 'fintoc' },
                { metodo: 'tarjeta', proveedor: 'stripe' }
            ];

            const metodos = [];

            for (const item of metodosPosibles) {
                const metodo = item.metodo;
                const proveedor = item.proveedor;

                // ¿El método está permitido en este país?
                // (Para retiros usamos lógica propia, no la de cobros,
                //  porque 'crypto' no es un método de cobro pero sí de retiro.)
                const permitidoEnPais = (function () {
                    if (metodo === 'crypto') {
                        return pais.proveedores_habilitados.includes('nowpayments');
                    }
                    if (metodo === 'spei') {
                        return pais.proveedores_habilitados.includes('fintoc');
                    }
                    if (metodo === 'tarjeta') {
                        return pais.proveedores_habilitados.includes('stripe');
                    }
                    return false;
                })();

                if (!permitidoEnPais) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: `No disponible en ${pais.nombre}`
                    });
                    continue;
                }

                // ¿El adapter está implementado?
                const implementado = adapterPayoutImplementado(proveedor);
                if (!implementado) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Próximamente'
                    });
                    continue;
                }

                // ¿El proveedor está configurado?
                const configurado = proveedorConfigurado(proveedor);
                if (!configurado) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Servicio no configurado en este entorno'
                    });
                    continue;
                }

                // Disponible
                const itemDisponible = {
                    metodo: metodo,
                    disponible: true
                };

                // Info extra por método
                if (metodo === 'crypto') {
                    itemDisponible.monedas = ['USDT', 'USDC'];
                    itemDisponible.redes = {
                        USDT: ['usdttrc20', 'usdtbsc', 'usdtmatic', 'usdtsol', 'usdterc20'],
                        USDC: ['usdcsol', 'usdcmatic', 'usdcbsc', 'usdc']
                    };
                    itemDisponible.requiere = ['wallet_destino', 'red_crypto', 'moneda_destino'];
                } else if (metodo === 'spei') {
                    itemDisponible.requiere = ['clabe_destino'];
                    itemDisponible.moneda = 'MXN';
                } else if (metodo === 'tarjeta') {
                    itemDisponible.requiere = ['cuenta_connect'];
                    itemDisponible.moneda = 'MXN';
                }

                metodos.push(itemDisponible);
            }

            return res.status(200).json({
                success: true,
                data: {
                    tiene_cuenta: true,
                    pais: codigoPais,
                    moneda_principal: cuenta.moneda_principal,
                    metodos: metodos
                }
            });

        } catch (err) {
            logger.error(`[Pay Retiros] Error en metodos-disponibles: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros
// PRIVADO - Solicitar un retiro.
// ================================================================

router.post(
    '/',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            // ---------- Validaciones de entrada ----------
            if (!body.montoMxn) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el monto a retirar'
                });
            }

            if (!body.metodo) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el método de retiro'
                });
            }

            const metodo = String(body.metodo).trim().toLowerCase();

            if (!['spei', 'crypto', 'tarjeta'].includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: `Método de retiro no válido: ${metodo}`
                });
            }

            // ---------- Resolver cuenta del usuario ----------
            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(400).json({
                    success: false,
                    error: 'No tienes una cuenta de Csariel\'s Pay activa'
                });
            }

            // ---------- Idempotency key ----------
            const idempotencyKey = body.idempotencyKey || generarIdempotencyKey(usuarioId);

            // ---------- Delegar al servicio ----------
            const retiro = await retirosService.solicitarRetiro({
                usuarioId: usuarioId,
                cuentaId: cuenta.id,
                montoMxn: body.montoMxn,
                metodo: metodo,
                monedaDestino: body.monedaDestino || null,
                destinoUltimos4: body.destinoUltimos4 || null,
                redCrypto: body.redCrypto || null,
                walletDestino: body.walletDestino || null,
                idempotencyKey: idempotencyKey,
                datosExtra: {
                    pais: body.codigoPais || 'MX',
                    user_agent: req.headers['user-agent'] || null,
                    ip: req.headers['x-forwarded-for'] || req.ip || null
                }
            });

            logger.info(
                `[Pay Retiros] Retiro ${retiro.id} solicitado por ${usuarioId} ` +
                `(${metodo}, $${retiro.monto_mxn} MXN → ${retiro.estado})`
            );

            return res.status(201).json({
                success: true,
                data: {
                    id: retiro.id,
                    monto_mxn: Number(retiro.monto_mxn),
                    moneda_destino: retiro.moneda_destino,
                    metodo: retiro.metodo,
                    proveedor: retiro.proveedor,
                    estado: retiro.estado,
                    red_crypto: retiro.red_crypto,
                    wallet_destino: retiro.wallet_destino ? String(retiro.wallet_destino).slice(0, 8) + '...' : null,
                    destino_ultimos4: retiro.destino_ultimos4,
                    provider_status: retiro.provider_status,
                    created_at: retiro.created_at
                }
            });

        } catch (err) {
            logger.error(`[Pay Retiros] Error solicitando retiro: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/retiros
// PRIVADO - Listar retiros del usuario autenticado.
// ================================================================

router.get(
    '/',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(200).json({
                    success: true,
                    data: {
                        retiros: [],
                        total: 0,
                        limite: 50,
                        offset: 0,
                        tiene_cuenta: false
                    }
                });
            }

            const estadosValidos = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
            let estados = null;

            if (req.query.estado) {
                const estadosQuery = String(req.query.estado)
                    .split(',')
                    .map(function (e) { return e.trim(); })
                    .filter(function (e) { return estadosValidos.includes(e); });

                if (estadosQuery.length > 0) {
                    estados = estadosQuery;
                }
            }

            const resultado = await retirosService.listarRetiros({
                cuentaId: cuenta.id,
                estados: estados,
                limite: req.query.limite,
                offset: req.query.offset
            });

            // Sanitizar wallet_destino antes de responder
            const retirosSanitizados = (resultado.retiros || []).map(function (r) {
                return Object.assign({}, r, {
                    wallet_destino: r.wallet_destino
                        ? String(r.wallet_destino).slice(0, 8) + '...' + String(r.wallet_destino).slice(-4)
                        : null
                });
            });

            return res.status(200).json({
                success: true,
                data: {
                    tiene_cuenta: true,
                    cuenta_id: cuenta.id,
                    retiros: retirosSanitizados,
                    total: resultado.total,
                    limite: resultado.limite,
                    offset: resultado.offset
                }
            });

        } catch (err) {
            logger.error(`[Pay Retiros] Error listando retiros: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/retiros/:id
// PRIVADO - Consultar un retiro específico (con ownership).
// ================================================================

router.get(
    '/:id',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const retiroId = req.params.id;

            if (!retiroId) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el ID del retiro'
                });
            }

            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(404).json({
                    success: false,
                    error: 'Retiro no encontrado'
                });
            }

            const retiro = await retirosService.obtenerRetiro({
                retiroId: retiroId,
                cuentaId: cuenta.id
            });

            // Sanitizar wallet_destino
            const retiroSanitizado = Object.assign({}, retiro, {
                wallet_destino: retiro.wallet_destino
                    ? String(retiro.wallet_destino).slice(0, 8) + '...' + String(retiro.wallet_destino).slice(-4)
                    : null
            });

            return res.status(200).json({
                success: true,
                data: retiroSanitizado
            });

        } catch (err) {
            logger.error(`[Pay Retiros] Error consultando retiro: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;