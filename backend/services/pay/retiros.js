// ================================================================
// ROUTES/PAY/RETIROS.JS
// CSARIEL'S PAY - ROUTER DE RETIROS CON VERIFICACIÓN BIOMÉTRICA
// ================================================================
// Endpoints:
//   GET  /api/pay/retiros                          (privado)
//   POST /api/pay/retiros                          (privado, requiere token_verificacion)
//   GET  /api/pay/retiros/metodos-disponibles      (privado)
//   GET  /api/pay/retiros/metodos-verificacion     (privado)
//   POST /api/pay/retiros/registrar-selfie         (privado)
//   GET  /api/pay/retiros/:id                      (privado)
//
//   POST /api/pay/retiros/liveness/challenge       (privado)
//   POST /api/pay/retiros/liveness/validar         (privado)
//
//   POST /api/pay/retiros/webauthn/challenge       (privado)
//   POST /api/pay/retiros/webauthn/validar         (privado)
//
//   POST /api/pay/retiros/facial/challenge         (privado)
//   POST /api/pay/retiros/facial/validar           (privado)
//
// REGLA CRÍTICA:
//   POST /api/pay/retiros requiere token_verificacion.
//   El token solo se obtiene después de pasar liveness + biometría.
//   Para emitir el token se exige que exista una verificación de
//   liveness exitosa reciente (≤ 5 minutos).
// ================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');

const retirosService = require('../../services/pay/retiros');
const biometria = require('../../services/pay/biometria');
const liveness = require('../../services/pay/liveness');
const verificacionTokens = require('../../services/pay/verificacion-tokens');
const paises = require('../../services/pay/geo/paises');
const errors = require('../../services/pay/errors');

// ================================================================
// HELPERS
// ================================================================

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

function generarIdempotencyKey(usuarioId) {
    const random = crypto.randomBytes(8).toString('hex');
    return `retiro-${usuarioId}-${Date.now()}-${random}`;
}

function proveedorConfigurado(proveedor) {
    if (proveedor === 'stripe') return Boolean(process.env.STRIPE_SECRET_KEY);
    if (proveedor === 'fintoc') return Boolean(process.env.FINTOC_SECRET_KEY);
    if (proveedor === 'nowpayments') return Boolean(process.env.NOWPAYMENTS_API_KEY);
    return false;
}

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

/**
 * Verifica que el usuario tenga una verificación de liveness exitosa
 * reciente (≤ 5 minutos). Se llama ANTES de emitir un token de retiro.
 * Si no la tiene, lanza error de autorización.
 */
function exigirLivenessReciente(usuarioId) {
    const verificacion = liveness.obtenerUltimaVerificacionExitosa(usuarioId);

    if (!verificacion || !verificacion.verificada) {
        throw new errors.ErrorAutorizacion(
            'LIVENESS_REQUERIDO',
            'Debes completar la verificación de liveness antes de generar el token de retiro.'
        );
    }

    return verificacion;
}

// ================================================================
// GET /api/pay/retiros/metodos-verificacion
// ================================================================

router.get(
    '/metodos-verificacion',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const metodos = await biometria.obtenerMetodosDisponibles(usuarioId);

            return res.status(200).json({
                success: true,
                data: {
                    huella_disponible: metodos.huella_disponible,
                    rostro_disponible: metodos.rostro_disponible,
                    selfie_registrada: metodos.selfie_registrada,
                    total_dispositivos: metodos.total_dispositivos,
                    liveness: liveness.obtenerConfiguracion(),
                    necesita_registrar: !metodos.huella_disponible && !metodos.rostro_disponible
                }
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en metodos-verificacion: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/registrar-selfie
// ================================================================

router.post(
    '/registrar-selfie',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.url_selfie || typeof body.url_selfie !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Falta la URL de la selfie'
                });
            }

            const url = body.url_selfie.trim();

            if (url.length < 20) {
                return res.status(400).json({
                    success: false,
                    error: 'La URL de la selfie es demasiado corta'
                });
            }

            if (url.indexOf('http') !== 0) {
                return res.status(400).json({
                    success: false,
                    error: 'La URL de la selfie debe comenzar con http o https'
                });
            }

            if (url.indexOf('supabase') === -1) {
                logger.warning(`[Pay Retiros] URL de selfie no parece de Supabase: ${url.slice(0, 50)}...`);
            }

            await biometria.registrarSelfieVerificacion(usuarioId, url);

            logger.info(`[Pay Retiros] Selfie registrada para usuario ${usuarioId}`);

            return res.status(200).json({
                success: true,
                data: {
                    mensaje: 'Selfie registrada correctamente',
                    rostro_disponible: true
                }
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en registrar-selfie: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/registrar-huella
// ================================================================

router.post(
    '/registrar-huella',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.credential_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta la credencial WebAuthn'
                });
            }

            const credencial = {
                id: body.credential_id,
                publicKey: body.public_key || null,
                transports: body.transports || ['internal']
            };

            await biometria.registrarCredencialWebAuthn(usuarioId, credencial);

            logger.info(`[Pay Retiros] Credencial WebAuthn registrada para usuario ${usuarioId}`);

            return res.status(200).json({
                success: true,
                data: {
                    mensaje: 'Credencial registrada correctamente',
                    huella_disponible: true
                }
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en registrar-huella: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/liveness/challenge
// ================================================================

router.post(
    '/liveness/challenge',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const challenge = liveness.generarChallengeLiveness(usuarioId);

            return res.status(200).json({
                success: true,
                data: challenge
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en liveness/challenge: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/liveness/validar
// ================================================================

router.post(
    '/liveness/validar',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.challenge_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el challenge_id'
                });
            }

            const resultado = liveness.validarResultadoLiveness(usuarioId, {
                challenge_id: body.challenge_id,
                liveness_score: body.liveness_score,
                frame_count: body.frame_count,
                duracion_ms: body.duracion_ms,
                accion_completada: body.accion_completada,
                accion_realizada: body.accion_realizada,
                micro_movimientos: body.micro_movimientos
            });

            return res.status(200).json({
                success: true,
                data: resultado
            });
        } catch (err) {
            logger.warning(`[Pay Retiros] Liveness falló para ${req.usuario.id}: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/webauthn/challenge
// ================================================================

router.post(
    '/webauthn/challenge',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const challenge = await biometria.generarChallengeWebAuthn(usuarioId);

            return res.status(200).json({
                success: true,
                data: challenge
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en webauthn/challenge: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/webauthn/validar
// ================================================================
// Ahora exige liveness reciente antes de emitir el token.
// ================================================================

router.post(
    '/webauthn/validar',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.challenge_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el challenge_id'
                });
            }

            await biometria.validarRespuestaWebAuthn(usuarioId, {
                challenge_id: body.challenge_id,
                credential_id: body.credential_id,
                client_data_json: body.client_data_json,
                authenticator_data: body.authenticator_data,
                signature: body.signature,
                user_handle: body.user_handle
            });

            // Exigir liveness reciente antes de emitir token
            const verificacionLiveness = exigirLivenessReciente(usuarioId);

            const monto = Number(body.monto_autorizado);
            const metodo = body.metodo_autorizado;

            if (!Number.isFinite(monto) || monto <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta monto_autorizado válido'
                });
            }

            if (!metodo || !['spei', 'crypto', 'tarjeta'].includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta metodo_autorizado (spei|crypto|tarjeta)'
                });
            }

            const tokenData = verificacionTokens.generarTokenVerificacion({
                usuarioId: usuarioId,
                montoMaximo: monto,
                metodo: metodo,
                metodoBiometrico: 'huella',
                livenessVerificado: true,
                metadata: {
                    ip: req.headers['x-forwarded-for'] || req.ip,
                    user_agent: req.headers['user-agent'] || null,
                    liveness_edad_ms: verificacionLiveness.edad_ms,
                    liveness_score: verificacionLiveness.score
                }
            });

            return res.status(200).json({
                success: true,
                data: {
                    verificado: true,
                    metodo: 'huella',
                    token_verificacion: tokenData.token,
                    expira_en_ms: tokenData.expira_en_ms,
                    monto_maximo: tokenData.monto_maximo,
                    metodo_autorizado: tokenData.metodo
                }
            });
        } catch (err) {
            logger.warning(`[Pay Retiros] WebAuthn falló para ${req.usuario.id}: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/facial/challenge
// ================================================================

router.post(
    '/facial/challenge',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const challenge = await biometria.generarChallengeFacial(usuarioId);

            return res.status(200).json({
                success: true,
                data: challenge
            });
        } catch (err) {
            logger.error(`[Pay Retiros] Error en facial/challenge: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/retiros/facial/validar
// ================================================================
// Ahora exige liveness reciente antes de emitir el token.
// ================================================================

router.post(
    '/facial/validar',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.challenge_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el challenge_id'
                });
            }

            await biometria.validarRespuestaFacial(usuarioId, {
                challenge_id: body.challenge_id,
                face_match_score: body.face_match_score,
                liveness_score: body.liveness_score
            });

            // Exigir liveness reciente antes de emitir token
            const verificacionLiveness = exigirLivenessReciente(usuarioId);

            const monto = Number(body.monto_autorizado);
            const metodo = body.metodo_autorizado;

            if (!Number.isFinite(monto) || monto <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta monto_autorizado válido'
                });
            }

            if (!metodo || !['spei', 'crypto', 'tarjeta'].includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta metodo_autorizado (spei|crypto|tarjeta)'
                });
            }

            const tokenData = verificacionTokens.generarTokenVerificacion({
                usuarioId: usuarioId,
                montoMaximo: monto,
                metodo: metodo,
                metodoBiometrico: 'rostro',
                livenessVerificado: true,
                metadata: {
                    ip: req.headers['x-forwarded-for'] || req.ip,
                    user_agent: req.headers['user-agent'] || null,
                    liveness_edad_ms: verificacionLiveness.edad_ms,
                    liveness_score: verificacionLiveness.score
                }
            });

            return res.status(200).json({
                success: true,
                data: {
                    verificado: true,
                    metodo: 'rostro',
                    token_verificacion: tokenData.token,
                    expira_en_ms: tokenData.expira_en_ms,
                    monto_maximo: tokenData.monto_maximo,
                    metodo_autorizado: tokenData.metodo
                }
            });
        } catch (err) {
            logger.warning(`[Pay Retiros] Facial falló para ${req.usuario.id}: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/retiros/metodos-disponibles
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

            const metodosPosibles = [
                { metodo: 'crypto', proveedor: 'nowpayments' },
                { metodo: 'spei', proveedor: 'fintoc' }
            ];

            const metodos = [];

            for (const item of metodosPosibles) {
                const metodo = item.metodo;
                const proveedor = item.proveedor;

                const permitidoEnPais = (function () {
                    if (metodo === 'crypto') return pais.proveedores_habilitados.includes('nowpayments');
                    if (metodo === 'spei') return pais.proveedores_habilitados.includes('fintoc');
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

                const implementado = adapterPayoutImplementado(proveedor);
                if (!implementado) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Próximamente'
                    });
                    continue;
                }

                const configurado = proveedorConfigurado(proveedor);
                if (!configurado) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Servicio no configurado'
                    });
                    continue;
                }

                const itemDisponible = {
                    metodo: metodo,
                    disponible: true
                };

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
// PRIVADO - Solicitar un retiro (REQUIERE token_verificacion).
// ================================================================
// ORDEN:
//   1. Validar inputs básicos.
//   2. Resolver cuenta (SIN consumir token todavía).
//   3. Validar y consumir token.
//   4. Solicitar retiro.
// ================================================================

router.post(
    '/',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

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

            if (!['spei', 'crypto'].includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: `Método de retiro no válido: ${metodo}`
                });
            }

            if (!body.token_verificacion) {
                return res.status(401).json({
                    success: false,
                    error: 'Se requiere verificación de identidad para este retiro'
                });
            }

            const monto = Number(body.montoMxn);

            // ---------- 1) Resolver cuenta PRIMERO (sin consumir token) ----------
            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(400).json({
                    success: false,
                    error: 'No tienes una cuenta de Csariel\'s Pay activa'
                });
            }

            // ---------- 2) Validar y consumir token (ya con cuenta verificada) ----------
            try {
                await verificacionTokens.validarYConsumirToken({
                    token: body.token_verificacion,
                    usuarioId: usuarioId,
                    monto: monto,
                    metodo: metodo
                });
            } catch (errToken) {
                logger.warning(
                    `[Pay Retiros] Token inválido para usuario ${usuarioId}: ${errToken.message}`
                );
                return errors.responderError(res, errToken);
            }

            const idempotencyKey = body.idempotencyKey || generarIdempotencyKey(usuarioId);

            const retiro = await retirosService.solicitarRetiro({
                usuarioId: usuarioId,
                cuentaId: cuenta.id,
                montoMxn: body.montoMxn,
                metodo: metodo,
                monedaDestino: body.monedaDestino || null,
                destinoUltimos4: body.destinoUltimos4 || null,
                redCrypto: body.redCrypto || null,
                walletDestino: body.walletDestino || null,
                clabeDestino: body.clabeDestino || null,
                idempotencyKey: idempotencyKey,
                datosExtra: {
                    pais: body.codigoPais || 'MX',
                    user_agent: req.headers['user-agent'] || null,
                    ip: req.headers['x-forwarded-for'] || req.ip || null,
                    token_verificacion_usado: true
                }
            });

            logger.info(
                `[Pay Retiros] Retiro ${retiro.id} solicitado por ${usuarioId} ` +
                `(${metodo}, $${retiro.monto_mxn} MXN → ${retiro.estado}) ` +
                `[verificado biométricamente]`
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
                    wallet_destino: retiro.wallet_destino
                        ? String(retiro.wallet_destino).slice(0, 8) + '...'
                        : null,
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