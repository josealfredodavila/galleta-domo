// ================================================================
// ROUTES/PAY/RETIROS.JS
// CSARIEL'S PAY - ROUTER DE RETIROS
// ================================================================
// Endpoints:
//   GET  /api/pay/retiros/metodos-verificacion     (privado)
//   POST /api/pay/retiros/registrar-selfie         (privado)
//   POST /api/pay/retiros/registrar-huella         (privado)
//   POST /api/pay/retiros/liveness/challenge       (privado)
//   POST /api/pay/retiros/liveness/validar         (privado)
//   POST /api/pay/retiros/webauthn/challenge       (privado)
//   POST /api/pay/retiros/webauthn/validar         (privado)
//   POST /api/pay/retiros/facial/challenge         (privado)
//   POST /api/pay/retiros/facial/validar           (privado)
//   GET  /api/pay/retiros/metodos-disponibles      (privado)
//   POST /api/pay/retiros                          (privado, requiere token_verificacion)
//   GET  /api/pay/retiros                          (privado)
//   GET  /api/pay/retiros/:id                      (privado)
//
// REGLAS DE VERIFICACIÓN:
//   - Huella (WebAuthn): validada por la firma criptográfica del
//     dispositivo. NO requiere liveness facial.
//   - Rostro: requiere liveness reciente y, en su momento, la
//     validación del proveedor Incode. Hasta entonces responde 503.
//   - POST /api/pay/retiros requiere token_verificacion de un solo uso.
//
// Métodos activos en esta fase: spei y crypto.
// Retiro por tarjeta (Stripe Connect) queda fuera de esta fase.
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
// CONSTANTES
// ================================================================

const METODOS_ACTIVOS = ['spei', 'crypto'];

const PROVEEDOR_POR_METODO = {
    spei: 'fintoc',
    crypto: 'nowpayments'
};

// Módulo que implementa crearPayout para cada proveedor.
// nowpayments usa nowpayments-payout.js (no nowpayments.js).
const MODULO_PAYOUT_POR_PROVEEDOR = {
    fintoc: '../../services/pay/providers/fintoc-payout',
    nowpayments: '../../services/pay/providers/nowpayments-payout'
};

const VARIABLE_ENTORNO_POR_PROVEEDOR = {
    fintoc: ['FINTOC_SECRET_KEY', 'FINTOC_SOURCE_ACCOUNT_ID'],
    nowpayments: ['NOWPAYMENTS_API_KEY']
};

const TIPO_DOCUMENTO_RFC = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/;

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

/**
 * Verifica que el proveedor tenga sus variables de entorno.
 */
function proveedorConfigurado(proveedor) {
    const requeridas = VARIABLE_ENTORNO_POR_PROVEEDOR[proveedor] || [];
    return requeridas.every(function (nombre) {
        return Boolean(process.env[nombre]);
    });
}

/**
 * Verifica que el módulo de payout del proveedor exista y exporte crearPayout.
 */
function adapterPayoutImplementado(proveedor) {
    const ruta = MODULO_PAYOUT_POR_PROVEEDOR[proveedor];

    if (!ruta) {
        return false;
    }

    try {
        const mod = require(ruta);
        return typeof mod.crearPayout === 'function';
    } catch (err) {
        logger.warn(`[Pay Retiros] Módulo de payout ${proveedor} no cargó: ${err.message}`);
        return false;
    }
}

/**
 * Valida el destino del retiro antes de llamar al servicio, para
 * responder 400 con mensaje claro sin consumir el token.
 */
function validarCamposDestino(metodo, body) {
    if (metodo === 'spei') {
        if (!body.clabeDestino || !/^\d{18}$/.test(String(body.clabeDestino))) {
            return 'La CLABE debe tener 18 dígitos';
        }

        const moneda = String(body.monedaDestino || 'MXN').toUpperCase();

        if (moneda !== 'MXN') {
            return 'SPEI solo acepta MXN';
        }

        if (!body.nombreTitular || String(body.nombreTitular).trim().length < 3) {
            return 'Falta el nombre del titular de la cuenta';
        }

        const rfc = String(body.rfcTitular || '').trim().toUpperCase();

        if (!TIPO_DOCUMENTO_RFC.test(rfc)) {
            return 'El RFC del titular no es válido';
        }

        return null;
    }

    if (metodo === 'crypto') {
        const moneda = String(body.monedaDestino || '').toUpperCase();

        if (!['USDT', 'USDC'].includes(moneda)) {
            return 'La moneda debe ser USDT o USDC';
        }

        if (!body.redCrypto) {
            return 'Falta la red de la wallet';
        }

        if (!body.walletDestino) {
            return 'Falta la dirección de la wallet';
        }

        return null;
    }

    return 'Método de retiro no válido';
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
// Recibe SOLO el path del objeto en Storage (pay_selfies/{id}.jpg).
// Nunca acepta URLs públicas: la selfie es un dato biométrico.
// ================================================================

router.post(
    '/registrar-selfie',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            const pathEsperado = `pay_selfies/${usuarioId}.jpg`;
            const pathRecibido = typeof body.path_selfie === 'string'
                ? body.path_selfie.trim()
                : '';

            if (pathRecibido !== pathEsperado) {
                return res.status(400).json({
                    success: false,
                    error: 'La selfie no corresponde a tu cuenta'
                });
            }

            await biometria.registrarSelfieVerificacion(usuarioId, pathEsperado);

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

            await biometria.registrarCredencialWebAuthn(usuarioId, {
                id: body.credential_id,
                publicKey: body.public_key || null,
                transports: body.transports || ['internal']
            });

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
            const challenge = liveness.generarChallengeLiveness(req.usuario.id);

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
            logger.warn(`[Pay Retiros] Liveness falló para ${req.usuario.id}: ${err.message}`);
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
            const challenge = await biometria.generarChallengeWebAuthn(req.usuario.id);

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
// La huella se valida con la firma criptográfica del dispositivo
// (WebAuthn, userVerification required). NO requiere liveness facial.
// El token se emite con metodoBiometrico 'huella' y livenessVerificado false.
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

            const monto = Number(body.monto_autorizado);
            const metodo = String(body.metodo_autorizado || '').toLowerCase();

            if (!Number.isFinite(monto) || monto <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta monto_autorizado válido'
                });
            }

            if (!METODOS_ACTIVOS.includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta metodo_autorizado (spei|crypto)'
                });
            }

            const tokenData = verificacionTokens.generarTokenVerificacion({
                usuarioId: usuarioId,
                montoMaximo: monto,
                metodo: metodo,
                metodoBiometrico: 'huella',
                livenessVerificado: false,
                metadata: {
                    ip: req.headers['x-forwarded-for'] || req.ip,
                    user_agent: req.headers['user-agent'] || null
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
            logger.warn(`[Pay Retiros] WebAuthn falló para ${req.usuario.id}: ${err.message}`);
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
            const challenge = await biometria.generarChallengeFacial(req.usuario.id);

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
// Rostro: exige liveness reciente. La validación de identidad se
// hará con Incode; mientras tanto biometria.validarRespuestaFacial
// responde 503 sin simular nada.
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
                incode_session_id: body.incode_session_id
            });

            const verificacionLiveness = liveness.obtenerUltimaVerificacionExitosa(usuarioId);

            if (!verificacionLiveness) {
                return res.status(403).json({
                    success: false,
                    error: 'Debes completar la verificación de liveness antes de retirar'
                });
            }

            const monto = Number(body.monto_autorizado);
            const metodo = String(body.metodo_autorizado || '').toLowerCase();

            if (!Number.isFinite(monto) || monto <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta monto_autorizado válido'
                });
            }

            if (!METODOS_ACTIVOS.includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta metodo_autorizado (spei|crypto)'
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
            logger.warn(`[Pay Retiros] Facial falló para ${req.usuario.id}: ${err.message}`);
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
                    data: { tiene_cuenta: false, metodos: [] }
                });
            }

            const codigoPais = paises.PAIS_POR_DEFECTO;
            const pais = paises.obtenerPais(codigoPais);

            if (!pais) {
                return res.status(200).json({
                    success: true,
                    data: { tiene_cuenta: true, pais: codigoPais, metodos: [] }
                });
            }

            const metodos = [];

            for (const metodo of METODOS_ACTIVOS) {
                const proveedor = PROVEEDOR_POR_METODO[metodo];

                if (!paises.metodoEstaPermitido(codigoPais, metodo)) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: `No disponible en ${pais.nombre}`
                    });
                    continue;
                }

                if (!pais.proveedores_habilitados.includes(proveedor)) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: `No disponible en ${pais.nombre}`
                    });
                    continue;
                }

                if (!adapterPayoutImplementado(proveedor)) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Próximamente'
                    });
                    continue;
                }

                if (!proveedorConfigurado(proveedor)) {
                    metodos.push({
                        metodo: metodo,
                        disponible: false,
                        motivo: 'Servicio no configurado'
                    });
                    continue;
                }

                const item = { metodo: metodo, disponible: true };

                if (metodo === 'crypto') {
                    item.monedas = ['USDT', 'USDC'];
                    item.redes = {
                        USDT: ['usdttrc20', 'usdtbsc', 'usdtmatic', 'usdtsol', 'usdterc20'],
                        USDC: ['usdcsol', 'usdcmatic', 'usdcbsc', 'usdc']
                    };
                    item.requiere = ['wallet_destino', 'red_crypto', 'moneda_destino'];
                } else if (metodo === 'spei') {
                    item.moneda = 'MXN';
                    item.requiere = ['clabe_destino', 'nombre_titular', 'rfc_titular'];
                }

                metodos.push(item);
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
// ================================================================
// Orden:
//   1. Validar inputs de forma barata (sin tocar la base).
//   2. Resolver cuenta del usuario.
//   3. Validar y consumir el token de verificación.
//   4. Delegar al servicio (reserva + envío + estados).
// ================================================================

router.post(
    '/',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            const monto = Number(body.montoMxn);

            if (!Number.isFinite(monto) || monto <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el monto a retirar'
                });
            }

            const metodo = String(body.metodo || '').trim().toLowerCase();

            if (!METODOS_ACTIVOS.includes(metodo)) {
                return res.status(400).json({
                    success: false,
                    error: `Método de retiro no válido: ${metodo || '(vacío)'}`
                });
            }

            const errorCampos = validarCamposDestino(metodo, body);

            if (errorCampos) {
                return res.status(400).json({
                    success: false,
                    error: errorCampos
                });
            }

            if (!body.token_verificacion) {
                return res.status(401).json({
                    success: false,
                    error: 'Se requiere verificación de identidad para este retiro'
                });
            }

            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(400).json({
                    success: false,
                    error: 'No tienes una cuenta de Csariel\'s Pay activa'
                });
            }

            // Consumir el token DESPUÉS de validar la cuenta.
            // Si el servicio falla después, el token ya quedó usado:
            // el usuario debe verificarse de nuevo (comportamiento intencional).
            try {
                await verificacionTokens.validarYConsumirToken({
                    token: body.token_verificacion,
                    usuarioId: usuarioId,
                    monto: monto,
                    metodo: metodo
                });
            } catch (errToken) {
                logger.warn(
                    `[Pay Retiros] Token inválido para usuario ${usuarioId}: ${errToken.message}`
                );
                return errors.responderError(res, errToken);
            }

            const idempotencyKey = body.idempotencyKey || generarIdempotencyKey(usuarioId);

            const retiro = await retirosService.solicitarRetiro({
                usuarioId: usuarioId,
                cuentaId: cuenta.id,
                montoMxn: monto,
                metodo: metodo,
                monedaDestino: body.monedaDestino || (metodo === 'spei' ? 'MXN' : null),
                redCrypto: body.redCrypto || null,
                walletDestino: body.walletDestino || null,
                clabeDestino: body.clabeDestino || null,
                nombreTitular: body.nombreTitular || null,
                rfcTitular: body.rfcTitular || null,
                idempotencyKey: idempotencyKey,
                datosExtra: {
                    pais: body.codigoPais || paises.PAIS_POR_DEFECTO,
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

            const estadosQuery = req.query.estado
                ? String(req.query.estado).split(',').map(function (e) { return e.trim(); })
                : null;

            const resultado = await retirosService.listarRetiros({
                cuentaId: cuenta.id,
                estados: estadosQuery,
                limite: req.query.limite,
                offset: req.query.offset
            });

            return res.status(200).json({
                success: true,
                data: {
                    tiene_cuenta: true,
                    cuenta_id: cuenta.id,
                    retiros: resultado.retiros,
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

            return res.status(200).json({
                success: true,
                data: retiro
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