// ================================================================
// ROUTES/PAY/INTENCIONES.JS
// CSARIEL'S PAY - ROUTER DE INTENCIONES DE COBRO
// ================================================================
// Endpoints:
//   POST   /api/pay/intenciones                        (privado)
//   GET    /api/pay/intenciones/:publicToken           (público)
//   POST   /api/pay/intenciones/:publicToken/pagar     (público)
//   GET    /api/pay/mis-intenciones                    (privado)
//   POST   /api/pay/intenciones/:id/cancelar           (privado)
//
// AUTO-CREACIÓN:
//   Si el usuario no tiene cuenta Pay pero es vendedor o repartidor
//   en Mercado, la cuenta se crea automáticamente al crear la
//   primera intención.
//
// METADATA:
//   Al crear la intención se agrega:
//     metadata.tipo: 'digital' | 'fisico'
//     metadata.liberar_al: '24h' | 'entregado'
//   Reglas:
//     - Si la intención tiene pedidoId → 'fisico' + 'entregado'
//     - Si NO tiene pedidoId → 'digital' + '24h'
//   Esto permite que el sistema sepa cómo liberar el saldo en el futuro.
//
// El estado 'paid' SOLO se marca por webhook del proveedor.
// ================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');

const core = require('../../services/pay/core');
const paises = require('../../services/pay/geo/paises');
const errors = require('../../services/pay/errors');

// ================================================================
// AUTO-CREACIÓN DE CUENTA PAY
// ================================================================

async function intentarCrearCuentaPay(usuarioId) {
    if (!usuarioId) return null;

    try {
        // 1) ¿Es vendedor?
        const { data: tienda } = await supabaseAdmin
            .from('mercado_tiendas')
            .select('id, usuario_id, nombre_negocio')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (tienda) {
            const { data: existente } = await supabaseAdmin
                .from('pay_cuentas')
                .select('*')
                .eq('usuario_id', usuarioId)
                .eq('tienda_id', tienda.id)
                .maybeSingle();

            if (existente) return existente;

            const { data: nueva, error: errIns } = await supabaseAdmin
                .from('pay_cuentas')
                .insert({
                    usuario_id: usuarioId,
                    tipo: 'vendedor',
                    estado: 'activa',
                    moneda_principal: 'MXN',
                    tienda_id: tienda.id,
                    repartidor_id: null
                })
                .select()
                .single();

            if (errIns) {
                if (errIns.code === '23505') {
                    const { data: reintento } = await supabaseAdmin
                        .from('pay_cuentas')
                        .select('*')
                        .eq('usuario_id', usuarioId)
                        .eq('tienda_id', tienda.id)
                        .maybeSingle();
                    return reintento || null;
                }
                logger.error(`[Pay Intenciones] Error creando cuenta vendedor: ${errIns.message}`);
                return null;
            }

            await supabaseAdmin
                .from('pay_saldos')
                .insert({
                    cuenta_id: nueva.id,
                    disponible_mxn: 0,
                    pendiente_mxn: 0
                })
                .then(function (r) {
                    if (r.error && r.error.code !== '23505') {
                        logger.warning(`[Pay Intenciones] Error creando saldos: ${r.error.message}`);
                    }
                });

            logger.info(`[Pay Intenciones] Cuenta Pay creada automáticamente (vendedor): ${nueva.id}`);
            return nueva;
        }

        // 2) ¿Es repartidor?
        const { data: repartidor } = await supabaseAdmin
            .from('mercado_repartidores')
            .select('id, usuario_id, nombre_completo')
            .eq('usuario_id', usuarioId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (repartidor) {
            const { data: existente } = await supabaseAdmin
                .from('pay_cuentas')
                .select('*')
                .eq('usuario_id', usuarioId)
                .eq('repartidor_id', repartidor.id)
                .maybeSingle();

            if (existente) return existente;

            const { data: nueva, error: errIns } = await supabaseAdmin
                .from('pay_cuentas')
                .insert({
                    usuario_id: usuarioId,
                    tipo: 'repartidor',
                    estado: 'activa',
                    moneda_principal: 'MXN',
                    tienda_id: null,
                    repartidor_id: repartidor.id
                })
                .select()
                .single();

            if (errIns) {
                if (errIns.code === '23505') {
                    const { data: reintento } = await supabaseAdmin
                        .from('pay_cuentas')
                        .select('*')
                        .eq('usuario_id', usuarioId)
                        .eq('repartidor_id', repartidor.id)
                        .maybeSingle();
                    return reintento || null;
                }
                logger.error(`[Pay Intenciones] Error creando cuenta repartidor: ${errIns.message}`);
                return null;
            }

            await supabaseAdmin
                .from('pay_saldos')
                .insert({
                    cuenta_id: nueva.id,
                    disponible_mxn: 0,
                    pendiente_mxn: 0
                })
                .then(function (r) {
                    if (r.error && r.error.code !== '23505') {
                        logger.warning(`[Pay Intenciones] Error creando saldos: ${r.error.message}`);
                    }
                });

            logger.info(`[Pay Intenciones] Cuenta Pay creada automáticamente (repartidor): ${nueva.id}`);
            return nueva;
        }

        return null;

    } catch (err) {
        logger.error(`[Pay Intenciones] Error en intentarCrearCuentaPay: ${err.message}`);
        return null;
    }
}

// ================================================================
// HELPERS INTERNOS
// ================================================================

async function resolverCuentaDelUsuario(usuarioId) {
    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, tipo, tienda_id, repartidor_id, estado, moneda_principal')
        .eq('usuario_id', usuarioId)
        .eq('estado', 'activa')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Intenciones] Error buscando cuenta: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (data) return data;

    const creada = await intentarCrearCuentaPay(usuarioId);
    return creada || null;
}

async function resolverPaisDelUsuario(usuarioId) {
    // TODO futuro: leer de usuarios.pais si existe
    return 'MX';
}

function generarIdempotencyKey(usuarioId) {
    const random = crypto.randomBytes(8).toString('hex');
    return `${usuarioId}-${Date.now()}-${random}`;
}

/**
 * Determina el tipo y modo de liberación de una intención.
 *
 * Reglas:
 *   - Si tiene pedidoId → tipo 'fisico', liberar_al 'entregado'
 *   - Si NO tiene pedidoId → tipo 'digital', liberar_al '24h'
 *
 * Esto se guarda en metadata para que el sistema (actual o futuro)
 * sepa cómo manejar la liberación del saldo.
 */
function determinarTipoYLiberacion(pedidoId) {
    if (pedidoId) {
        return {
            tipo: 'fisico',
            liberar_al: 'entregado'
        };
    }
    return {
        tipo: 'digital',
        liberar_al: '24h'
    };
}

// ================================================================
// POST /api/pay/intenciones
// PRIVADO - El vendedor crea una intención de cobro.
// ================================================================

router.post(
    '/',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            if (!body.monto) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el monto'
                });
            }

            if (!body.metodo) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el método de pago'
                });
            }

            // ---------- Resolver cuenta receptora (con auto-creación) ----------
            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(400).json({
                    success: false,
                    error: 'No tienes una cuenta de Csariel\'s Pay activa. ' +
                           'Abre una tienda o regístrate como repartidor para obtener una.'
                });
            }

            const codigoPais = body.codigoPais || await resolverPaisDelUsuario(usuarioId);
            const idempotencyKey = body.idempotencyKey || generarIdempotencyKey(usuarioId);

            // ---------- Determinar tipo + liberación ----------
            const tipoYLiberacion = determinarTipoYLiberacion(body.pedidoId || null);

            // ---------- Combinar datosExtra del body con la metadata del sistema ----------
            const datosExtraDelCliente = (body.datosExtra && typeof body.datosExtra === 'object')
                ? body.datosExtra
                : {};

            const datosExtraFinal = Object.assign(
                {
                    tipo: tipoYLiberacion.tipo,
                    liberar_al: tipoYLiberacion.liberar_al
                },
                datosExtraDelCliente
            );

            // ---------- Crear la intención ----------
            const intencion = await core.crearIntencion({
                cuentaReceptoraId: cuenta.id,
                compradorId: null,
                monto: body.monto,
                metodo: body.metodo,
                codigoPais: codigoPais,
                moneda: body.moneda || null,
                pedidoId: body.pedidoId || null,
                descripcion: body.descripcion || null,
                idempotencyKey: idempotencyKey,
                datosExtra: datosExtraFinal
            });

            const PUBLIC_URL = process.env.PUBLIC_URL || '';
            const urlPago = PUBLIC_URL
                ? `${PUBLIC_URL}/pay/cobrar/${intencion.public_token}`
                : `/pay/cobrar/${intencion.public_token}`;

            logger.info(
                `[Pay Intenciones] Creada ${intencion.id} por usuario ${usuarioId} ` +
                `(${body.metodo}, $${intencion.monto} ${intencion.moneda}, ` +
                `tipo=${tipoYLiberacion.tipo}, liberar_al=${tipoYLiberacion.liberar_al})`
            );

            return res.status(201).json({
                success: true,
                data: {
                    id: intencion.id,
                    public_token: intencion.public_token,
                    monto: Number(intencion.monto),
                    moneda: intencion.moneda,
                    metodo_pago: intencion.metodo_pago,
                    estado: intencion.estado,
                    descripcion: intencion.descripcion,
                    expires_at: intencion.expires_at,
                    url_pago: urlPago,
                    tipo: tipoYLiberacion.tipo,
                    liberar_al: tipoYLiberacion.liberar_al
                }
            });

        } catch (err) {
            logger.error(`[Pay Intenciones] Error creando: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/intenciones/:publicToken
// PÚBLICO - El comprador consulta la intención (página del QR).
// ================================================================

router.get(
    '/:publicToken',
    async function (req, res) {
        try {
            const publicToken = req.params.publicToken;

            if (!publicToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el token público'
                });
            }

            const intencion = await core.obtenerIntencionPorTokenPublico(publicToken);

            return res.status(200).json({
                success: true,
                data: intencion
            });

        } catch (err) {
            logger.warning(`[Pay Intenciones] Error consultando ${req.params.publicToken}: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/intenciones/:publicToken/pagar
// PÚBLICO - El comprador elige método y crea el pago en el proveedor.
// ================================================================

router.post(
    '/:publicToken/pagar',
    async function (req, res) {
        try {
            const publicToken = req.params.publicToken;
            const body = req.body || {};
            const metodoElegido = body.metodo;

            if (!publicToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el token público'
                });
            }

            if (!metodoElegido) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el método de pago'
                });
            }

            const { data: intencion, error: errInt } = await supabaseAdmin
                .from('pay_intenciones')
                .select('*')
                .eq('public_token', publicToken.trim())
                .maybeSingle();

            if (errInt) {
                logger.error(`[Pay Intenciones] Error cargando intención: ${errInt.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error interno'
                });
            }

            if (!intencion) {
                return res.status(404).json({
                    success: false,
                    error: 'Intención no encontrada'
                });
            }

            if (intencion.estado === 'paid') {
                return res.status(409).json({
                    success: false,
                    error: 'Esta intención ya fue pagada'
                });
            }

            if (intencion.estado === 'expired') {
                return res.status(409).json({
                    success: false,
                    error: 'Esta intención de pago ha expirado'
                });
            }

            if (intencion.estado === 'cancelled') {
                return res.status(409).json({
                    success: false,
                    error: 'Esta intención fue cancelada'
                });
            }

            if (intencion.estado === 'failed') {
                return res.status(409).json({
                    success: false,
                    error: 'Esta intención falló'
                });
            }

            if (intencion.estado !== 'pending' && intencion.estado !== 'processing') {
                return res.status(409).json({
                    success: false,
                    error: 'La intención no está en un estado válido para pagar'
                });
            }

            if (intencion.expires_at && new Date(intencion.expires_at) < new Date()) {
                await supabaseAdmin
                    .from('pay_intenciones')
                    .update({
                        estado: 'expired',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', intencion.id)
                    .eq('estado', 'pending');

                return res.status(409).json({
                    success: false,
                    error: 'Esta intención de pago ha expirado'
                });
            }

            const metodoNorm = String(metodoElegido).trim().toLowerCase();

            if (!paises.METODOS_VALIDOS_GLOBAL.includes(metodoNorm)) {
                return res.status(400).json({
                    success: false,
                    error: `Método no válido: ${metodoElegido}`
                });
            }

            const codigoPais = (intencion.metadata && intencion.metadata.pais) || 'MX';

            if (!paises.metodoEstaPermitido(codigoPais, metodoNorm)) {
                return res.status(400).json({
                    success: false,
                    error: `El método ${metodoNorm} no está disponible en ${codigoPais}`
                });
            }

            let proveedor = paises.proveedorParaMetodo(codigoPais, metodoNorm);

            if (!proveedor) {
                return res.status(400).json({
                    success: false,
                    error: `No hay proveedor disponible para ${metodoNorm} en ${codigoPais}`
                });
            }

            if (intencion.metodo_pago !== metodoNorm || intencion.proveedor !== proveedor) {
                const { error: errUpd } = await supabaseAdmin
                    .from('pay_intenciones')
                    .update({
                        metodo_pago: metodoNorm,
                        proveedor: proveedor,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', intencion.id);

                if (errUpd) {
                    logger.error(`[Pay Intenciones] Error actualizando método: ${errUpd.message}`);
                    return res.status(500).json({
                        success: false,
                        error: 'Error actualizando la intención'
                    });
                }

                intencion.metodo_pago = metodoNorm;
                intencion.proveedor = proveedor;
            }

            let adapter;
            try {
                adapter = require(`../../services/pay/providers/${proveedor}`);
            } catch (errCarga) {
                logger.error(`[Pay Intenciones] Adapter ${proveedor} no disponible: ${errCarga.message}`);
                return res.status(503).json({
                    success: false,
                    error: `Proveedor ${proveedor} no está disponible en este momento`
                });
            }

            if (typeof adapter.crearPago !== 'function') {
                logger.error(`[Pay Intenciones] Adapter ${proveedor} sin crearPago`);
                return res.status(503).json({
                    success: false,
                    error: `Proveedor ${proveedor} no está disponible`
                });
            }

            let resultadoPago;
            try {
                resultadoPago = await adapter.crearPago(intencion);
            } catch (errPago) {
                logger.error(`[Pay Intenciones] Error creando pago: ${errPago.message}`);
                return errors.responderError(res, errPago);
            }

            const respuesta = {
                intencion_id: intencion.id,
                public_token: intencion.public_token,
                metodo: metodoNorm,
                proveedor: proveedor,
                monto: Number(intencion.monto),
                moneda: intencion.moneda,
                estado: 'pending'
            };

            if (proveedor === 'stripe') {
                respuesta.stripe = {
                    client_secret: resultadoPago.client_secret,
                    payment_intent_id: resultadoPago.provider_payment_id,
                    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null
                };
            } else if (proveedor === 'fintoc') {
                respuesta.fintoc = {
                    clabe: resultadoPago.clabe,
                    banco: resultadoPago.banco || null,
                    account_number_id: resultadoPago.provider_payment_id
                };
            } else if (proveedor === 'nowpayments') {
                respuesta.nowpayments = {
                    payment_id: resultadoPago.provider_payment_id,
                    pay_address: resultadoPago.pay_address,
                    pay_amount: resultadoPago.pay_amount,
                    pay_currency: resultadoPago.pay_currency,
                    payment_url: resultadoPago.payment_url
                };
            }

            logger.info(
                `[Pay Intenciones] Pago iniciado ${intencion.id} ` +
                `(${proveedor}/${metodoNorm})`
            );

            return res.status(200).json({
                success: true,
                data: respuesta
            });

        } catch (err) {
            logger.error(`[Pay Intenciones] Error en /pagar: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// GET /api/pay/mis-intenciones
// PRIVADO - El vendedor ve sus intenciones (cobros recibidos).
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
                        intenciones: [],
                        total: 0,
                        limite: 50,
                        offset: 0,
                        mensaje: 'No tienes cuenta Pay activa'
                    }
                });
            }

            const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 200);
            const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

            let query = supabaseAdmin
                .from('pay_intenciones')
                .select(
                    'id, public_token, pedido_id, monto, moneda, metodo_pago, proveedor, estado, descripcion, expires_at, paid_at, metadata, created_at',
                    { count: 'exact' }
                )
                .eq('cuenta_receptora_id', cuenta.id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limite - 1);

            if (req.query.estado) {
                const estadosValidos = ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded'];
                if (estadosValidos.includes(req.query.estado)) {
                    query = query.eq('estado', req.query.estado);
                }
            }

            const { data, error, count } = await query;

            if (error) {
                logger.error(`[Pay Intenciones] Error listando: ${error.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error consultando tus intenciones'
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    intenciones: data || [],
                    total: count || 0,
                    limite: limite,
                    offset: offset
                }
            });

        } catch (err) {
            logger.error(`[Pay Intenciones] Error en mis-intenciones: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/intenciones/:id/cancelar
// PRIVADO - El vendedor cancela una intención pending.
// ================================================================

router.post(
    '/:id/cancelar',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const intencionId = req.params.id;

            if (!intencionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el ID de la intención'
                });
            }

            const { data: intencion, error: errGet } = await supabaseAdmin
                .from('pay_intenciones')
                .select(`
                    id,
                    estado,
                    cuenta_receptora_id,
                    pay_cuentas:cuenta_receptora_id (usuario_id)
                `)
                .eq('id', intencionId)
                .maybeSingle();

            if (errGet) {
                logger.error(`[Pay Intenciones] Error buscando: ${errGet.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error consultando la intención'
                });
            }

            if (!intencion) {
                return res.status(404).json({
                    success: false,
                    error: 'Intención no encontrada'
                });
            }

            const duenoId = intencion.pay_cuentas && intencion.pay_cuentas.usuario_id;
            if (duenoId !== usuarioId) {
                return res.status(403).json({
                    success: false,
                    error: 'No tienes acceso a esta intención'
                });
            }

            if (intencion.estado === 'paid') {
                return res.status(409).json({
                    success: false,
                    error: 'No puedes cancelar una intención ya pagada'
                });
            }

            if (intencion.estado === 'cancelled') {
                return res.status(200).json({
                    success: true,
                    data: { id: intencionId, estado: 'cancelled', ya_cancelada: true }
                });
            }

            if (intencion.estado !== 'pending' && intencion.estado !== 'processing') {
                return res.status(409).json({
                    success: false,
                    error: `No puedes cancelar una intención en estado "${intencion.estado}"`
                });
            }

            const { error: errUpd } = await supabaseAdmin
                .from('pay_intenciones')
                .update({
                    estado: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('id', intencionId);

            if (errUpd) {
                logger.error(`[Pay Intenciones] Error cancelando: ${errUpd.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error cancelando la intención'
                });
            }

            logger.info(`[Pay Intenciones] Cancelada ${intencionId} por usuario ${usuarioId}`);

            return res.status(200).json({
                success: true,
                data: {
                    id: intencionId,
                    estado: 'cancelled'
                }
            });

        } catch (err) {
            logger.error(`[Pay Intenciones] Error en cancelar: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// EXPORTAR
// ================================================================

module.exports = router;