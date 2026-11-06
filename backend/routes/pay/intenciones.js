// ================================================================
// ROUTES/PAY/INTENCIONES.JS
// CSARIEL'S PAY - ROUTER DE INTENCIONES DE COBRO
// ================================================================
// Endpoints:
//   POST   /api/pay/intenciones                        (privado, rate limit por usuario)
//   GET    /api/pay/intenciones/:publicToken           (público)
//   POST   /api/pay/intenciones/:publicToken/pagar     (público, rate limit por IP+token)
//   GET    /api/pay/mis-intenciones                    (privado)
//   POST   /api/pay/intenciones/:id/cancelar           (privado)
//
// Validaciones de esta versión:
//   - Rate limit: 100 cobros creados por hora por usuario;
//     5 intentos de pago por minuto por IP y token.
//   - pedidoId: el pedido debe existir, pertenecer a la tienda de la
//     cuenta, no estar cancelado, tener el mismo total que el monto y
//     no tener ya un cobro activo o pagado.
//   - Métodos aceptados: el cobro guarda metadata.metodos_aceptados
//     (jsonb, sin cambios al esquema). /pagar solo acepta esos métodos
//     y el GET solo muestra esos métodos al comprador.
//   - Metadata: el cliente ya NO puede inyectar datos en metadata.
//   - Cancelar: no se permite mientras el cobro tiene un pago en proceso.
//
// El estado 'paid' SOLO se marca por webhook del proveedor.
// ================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const { verificarToken } = require('../../middleware/auth');

const core = require('../../services/pay/core');
const paises = require('../../services/pay/geo/paises');
const errors = require('../../services/pay/errors');

// ================================================================
// CONSTANTES
// ================================================================

const MONTO_MINIMO = 1;
const MONTO_MAXIMO = 500000;

// Estados de un pedido que ya tiene un cobro asociado
const ESTADOS_COBRO_ACTIVO = ['pending', 'processing', 'paid'];

const ESTADOS_LISTADO = ['pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded'];

// ================================================================
// RATE LIMITS
// ================================================================
// Se aplican después de verificarToken, así que req.usuario existe.
// /pagar es público: se limita por IP y token.

const limitadorCreacion = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `usuario:${req.usuario && req.usuario.id ? req.usuario.id : req.ip}`,
    message: {
        success: false,
        error: 'Has creado demasiados cobros en poco tiempo. Intenta más tarde.'
    }
});

const limitadorPagar = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `ip:${req.ip}|token:${req.params.publicToken || ''}`,
    message: {
        success: false,
        error: 'Demasiados intentos de pago. Espera un minuto e intenta de nuevo.'
    }
});

// ================================================================
// HELPERS DE CUENTA
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

            const { error: errSaldo } = await supabaseAdmin
                .from('pay_saldos')
                .insert({ cuenta_id: nueva.id, disponible_mxn: 0, pendiente_mxn: 0 });

            if (errSaldo && errSaldo.code !== '23505') {
                logger.warn(`[Pay Intenciones] Error creando saldos: ${errSaldo.message}`);
            }

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

            const { error: errSaldo } = await supabaseAdmin
                .from('pay_saldos')
                .insert({ cuenta_id: nueva.id, disponible_mxn: 0, pendiente_mxn: 0 });

            if (errSaldo && errSaldo.code !== '23505') {
                logger.warn(`[Pay Intenciones] Error creando saldos: ${errSaldo.message}`);
            }

            logger.info(`[Pay Intenciones] Cuenta Pay creada automáticamente (repartidor): ${nueva.id}`);
            return nueva;
        }

        return null;

    } catch (err) {
        logger.error(`[Pay Intenciones] Error en intentarCrearCuentaPay: ${err.message}`);
        return null;
    }
}

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

    return intentarCrearCuentaPay(usuarioId);
}

// ================================================================
// HELPERS DE COBRO
// ================================================================

function generarIdempotencyKeyServidor(usuarioId) {
    const random = crypto.randomBytes(8).toString('hex');
    return `u:${usuarioId}:${Date.now()}:${random}`;
}

/**
 * Llave de idempotencia del cliente, prefijada con el usuario para que
 * dos vendedores nunca colisionen aunque manden la misma cadena.
 */
function idempotencyKeyDeCliente(usuarioId, clienteKey) {
    if (typeof clienteKey !== 'string') return null;

    const limpia = clienteKey.trim();

    if (limpia.length < 8 || limpia.length > 120) return null;

    return `u:${usuarioId}:${limpia}`;
}

function validarMonto(valor) {
    const n = Number(valor);

    if (!Number.isFinite(n) || n < MONTO_MINIMO || n > MONTO_MAXIMO) {
        return null;
    }

    return Math.round(n * 100) / 100;
}

function determinarTipoYLiberacion(pedidoId) {
    if (pedidoId) {
        return { tipo: 'fisico', liberar_al: 'entregado' };
    }

    return { tipo: 'digital', liberar_al: '24h' };
}

/**
 * Métodos que el vendedor aceptó para un cobro. Si el cobro es anterior
 * a esta validación (sin metadata), solo se acepta el método original.
 */
function metodosAceptadosDe(intencion) {
    const meta = intencion && intencion.metadata;

    if (meta && Array.isArray(meta.metodos_aceptados) && meta.metodos_aceptados.length > 0) {
        return meta.metodos_aceptados;
    }

    return intencion && intencion.metodo_pago ? [intencion.metodo_pago] : [];
}

/**
 * Limpia la lista de métodos enviada por el cliente: solo métodos válidos
 * y permitidos en el país. El método principal siempre va primero.
 */
function sanitizarMetodosAceptados(listaCliente, metodoPrincipal, codigoPais) {
    const permitidos = paises.metodosDisponiblesConProveedor(codigoPais).map(function (m) {
        return m.metodo;
    });

    const candidatos = [metodoPrincipal].concat(
        Array.isArray(listaCliente) ? listaCliente : []
    );

    const limpios = [];

    for (const raw of candidatos) {
        const m = String(raw || '').trim().toLowerCase();

        if (!m || limpios.includes(m)) continue;
        if (!paises.METODOS_VALIDOS_GLOBAL.includes(m)) continue;
        if (!permitidos.includes(m)) continue;

        limpios.push(m);
    }

    return limpios;
}

/**
 * Valida que el pedido pertenezca a la tienda de la cuenta, esté activo,
 * tenga el mismo total que el monto del cobro y no tenga ya un cobro.
 */
async function validarPedidoParaCobro(pedidoId, cuenta, monto) {
    if (!cuenta.tienda_id) {
        throw new errors.ErrorValidacion(
            'PEDIDO_SOLO_TIENDA',
            'Solo una tienda puede cobrar pedidos de Mercado'
        );
    }

    const { data: pedido, error } = await supabaseAdmin
        .from('mercado_pedidos')
        .select('id, tienda_id, total_mxn, cancelado_en, estado')
        .eq('id', pedidoId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Intenciones] Error leyendo pedido ${pedidoId}: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!pedido) {
        throw new errors.ErrorNoEncontrado('PEDIDO_NO_ENCONTRADO', 'El pedido no existe');
    }

    if (Number(pedido.tienda_id) !== Number(cuenta.tienda_id)) {
        logger.warn(
            `[Pay Intenciones] Intento de cobrar pedido ${pedidoId} de otra tienda ` +
            `(cuenta ${cuenta.id})`
        );
        throw new errors.ErrorAutorizacion(
            'PEDIDO_NO_ES_DE_TU_TIENDA',
            'Ese pedido no pertenece a tu tienda'
        );
    }

    if (pedido.cancelado_en) {
        throw new errors.ErrorConflicto('PEDIDO_CANCELADO', 'El pedido está cancelado');
    }

    const totalCentavos = Math.round(Number(pedido.total_mxn) * 100);
    const montoCentavos = Math.round(monto * 100);

    if (totalCentavos !== montoCentavos) {
        throw new errors.ErrorValidacion(
            'MONTO_NO_COINCIDE_PEDIDO',
            `El monto debe ser igual al total del pedido: $${(totalCentavos / 100).toFixed(2)} MXN`
        );
    }

    const { data: activos, error: errActivos } = await supabaseAdmin
        .from('pay_intenciones')
        .select('id')
        .eq('pedido_id', pedidoId)
        .in('estado', ESTADOS_COBRO_ACTIVO)
        .limit(1);

    if (errActivos) {
        logger.error(`[Pay Intenciones] Error revisando cobros del pedido: ${errActivos.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errActivos.message);
    }

    if (activos && activos.length > 0) {
        throw new errors.ErrorConflicto(
            'PEDIDO_YA_TIENE_COBRO',
            'Este pedido ya tiene un cobro activo o pagado'
        );
    }

    return pedido;
}

// ================================================================
// POST /api/pay/intenciones
// PRIVADO - El vendedor crea una intención de cobro.
// ================================================================

router.post(
    '/',
    verificarToken,
    limitadorCreacion,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const body = req.body || {};

            const monto = validarMonto(body.monto);

            if (monto === null) {
                return res.status(400).json({
                    success: false,
                    error: `El monto debe estar entre $${MONTO_MINIMO} y $${MONTO_MAXIMO} MXN`
                });
            }

            const metodo = String(body.metodo || '').trim().toLowerCase();

            if (!metodo) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el método de pago'
                });
            }

            const codigoPais = paises.normalizarCodigoPais(body.codigoPais) || paises.PAIS_POR_DEFECTO;

            if (!paises.esPaisSoportado(codigoPais)) {
                return res.status(400).json({
                    success: false,
                    error: `El país ${codigoPais} no está disponible en Csariel's Pay`
                });
            }

            if (!paises.metodoEstaPermitido(codigoPais, metodo)) {
                return res.status(400).json({
                    success: false,
                    error: `El método ${metodo} no está disponible en ${codigoPais}`
                });
            }

            const metodosAceptados = sanitizarMetodosAceptados(
                body.metodosAceptados,
                metodo,
                codigoPais
            );

            const cuenta = await resolverCuentaDelUsuario(usuarioId);

            if (!cuenta) {
                return res.status(400).json({
                    success: false,
                    error: 'No tienes una cuenta de Csariel\'s Pay activa. ' +
                           'Abre una tienda o regístrate como repartidor para obtener una.'
                });
            }

            let pedidoId = null;

            if (body.pedidoId !== undefined && body.pedidoId !== null && body.pedidoId !== '') {
                const pidTexto = String(body.pedidoId).trim();

                if (!/^\d+$/.test(pidTexto)) {
                    return res.status(400).json({
                        success: false,
                        error: 'El pedido indicado no es válido'
                    });
                }

                pedidoId = Number(pidTexto);

                await validarPedidoParaCobro(pedidoId, cuenta, monto);
            }

            const tipoYLiberacion = determinarTipoYLiberacion(pedidoId);

            const idempotencyKey =
                idempotencyKeyDeCliente(usuarioId, body.idempotencyKey) ||
                generarIdempotencyKeyServidor(usuarioId);

            const descripcion = body.descripcion
                ? String(body.descripcion).trim().slice(0, 200)
                : null;

            // Metadata SOLO desde el servidor. Lo que mande el cliente en
            // datosExtra se ignora a propósito.
            const intencion = await core.crearIntencion({
                cuentaReceptoraId: cuenta.id,
                compradorId: null,
                monto: monto,
                metodo: metodo,
                codigoPais: codigoPais,
                moneda: null,
                pedidoId: pedidoId,
                descripcion: descripcion,
                idempotencyKey: idempotencyKey,
                datosExtra: {
                    tipo: tipoYLiberacion.tipo,
                    liberar_al: tipoYLiberacion.liberar_al,
                    metodos_aceptados: metodosAceptados,
                    creada_por_usuario: usuarioId
                }
            });

            const PUBLIC_URL = process.env.PUBLIC_URL || '';
            const urlPago = PUBLIC_URL
                ? `${PUBLIC_URL}/pay/cobrar/${intencion.public_token}`
                : `/pay/cobrar/${intencion.public_token}`;

            logger.info(
                `[Pay Intenciones] Creada ${intencion.id} por usuario ${usuarioId} ` +
                `(${metodo}, $${intencion.monto} ${intencion.moneda}, ` +
                `aceptados=${metodosAceptados.join('|')}, ` +
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
                    metodos_aceptados: metodosAceptados,
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
// PÚBLICO - La página de pago consulta el estado y los métodos.
// Solo se muestran los métodos que aceptó el vendedor.
// ================================================================

router.get(
    '/:publicToken',
    async function (req, res) {
        try {
            const publicToken = String(req.params.publicToken || '').trim();

            if (!publicToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el token público'
                });
            }

            const intencion = await core.obtenerIntencionPorTokenPublico(publicToken);

            const { data: fila, error } = await supabaseAdmin
                .from('pay_intenciones')
                .select('metodo_pago, metadata')
                .eq('public_token', publicToken)
                .maybeSingle();

            if (error) {
                logger.error(`[Pay Intenciones] Error leyendo métodos aceptados: ${error.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error consultando la solicitud de pago'
                });
            }

            const aceptados = metodosAceptadosDe(fila);

            intencion.metodos_disponibles = (intencion.metodos_disponibles || []).filter(function (m) {
                return aceptados.includes(m.metodo);
            });

            return res.status(200).json({
                success: true,
                data: intencion
            });

        } catch (err) {
            logger.warn(`[Pay Intenciones] Error consultando ${req.params.publicToken}: ${err.message}`);
            return errors.responderError(res, err);
        }
    }
);

// ================================================================
// POST /api/pay/intenciones/:publicToken/pagar
// PÚBLICO - El comprador elige un método y se crea el pago con el proveedor.
// ================================================================

router.post(
    '/:publicToken/pagar',
    limitadorPagar,
    async function (req, res) {
        try {
            const publicToken = String(req.params.publicToken || '').trim();
            const body = req.body || {};

            if (!publicToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el token público'
                });
            }

            if (!body.metodo) {
                return res.status(400).json({
                    success: false,
                    error: 'Falta el método de pago'
                });
            }

            const { data: intencion, error: errInt } = await supabaseAdmin
                .from('pay_intenciones')
                .select('*')
                .eq('public_token', publicToken)
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
                return res.status(409).json({ success: false, error: 'Esta intención ya fue pagada' });
            }

            if (intencion.estado === 'expired') {
                return res.status(409).json({ success: false, error: 'Esta intención de pago ha expirado' });
            }

            if (intencion.estado === 'cancelled') {
                return res.status(409).json({ success: false, error: 'Esta intención fue cancelada' });
            }

            if (intencion.estado === 'failed') {
                return res.status(409).json({ success: false, error: 'Esta intención falló' });
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
                    .update({ estado: 'expired', updated_at: new Date().toISOString() })
                    .eq('id', intencion.id)
                    .eq('estado', 'pending');

                return res.status(409).json({
                    success: false,
                    error: 'Esta intención de pago ha expirado'
                });
            }

            const metodoNorm = String(body.metodo).trim().toLowerCase();

            if (!paises.METODOS_VALIDOS_GLOBAL.includes(metodoNorm)) {
                return res.status(400).json({
                    success: false,
                    error: 'Método de pago no válido'
                });
            }

            const codigoPais = (intencion.metadata && intencion.metadata.pais) || paises.PAIS_POR_DEFECTO;

            if (!paises.metodoEstaPermitido(codigoPais, metodoNorm)) {
                return res.status(400).json({
                    success: false,
                    error: `El método ${metodoNorm} no está disponible en ${codigoPais}`
                });
            }

            // Filtro de métodos aceptados por el vendedor
            if (!metodosAceptadosDe(intencion).includes(metodoNorm)) {
                logger.warn(
                    `[Pay Intenciones] Método ${metodoNorm} no aceptado por el vendedor ` +
                    `en la intención ${intencion.id}`
                );
                return res.status(400).json({
                    success: false,
                    error: 'Este cobro no acepta ese método de pago'
                });
            }

            const proveedor = paises.proveedorParaMetodo(codigoPais, metodoNorm);

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

            // Pago en curso: la intención pasa a 'processing' para que el
            // vendedor ya no pueda cancelarla mientras el comprador paga.
            const { error: errProc } = await supabaseAdmin
                .from('pay_intenciones')
                .update({ estado: 'processing', updated_at: new Date().toISOString() })
                .eq('id', intencion.id)
                .eq('estado', 'pending');

            if (errProc) {
                logger.warn(`[Pay Intenciones] No se pudo marcar processing: ${errProc.message}`);
            }

            const respuesta = {
                intencion_id: intencion.id,
                public_token: intencion.public_token,
                metodo: metodoNorm,
                proveedor: proveedor,
                monto: Number(intencion.monto),
                moneda: intencion.moneda,
                estado: 'processing'
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

            logger.info(`[Pay Intenciones] Pago iniciado ${intencion.id} (${proveedor}/${metodoNorm})`);

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
// PRIVADO - Cobros del vendedor.
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

            if (req.query.estado && ESTADOS_LISTADO.includes(req.query.estado)) {
                query = query.eq('estado', req.query.estado);
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
// PRIVADO - El vendedor cancela un cobro que aún no tiene pago en curso.
// ================================================================

router.post(
    '/:id/cancelar',
    verificarToken,
    async function (req, res) {
        try {
            const usuarioId = req.usuario.id;
            const intencionId = String(req.params.id || '').trim();

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
                    error: 'No puedes cancelar un cobro ya pagado'
                });
            }

            if (intencion.estado === 'cancelled') {
                return res.status(200).json({
                    success: true,
                    data: { id: intencionId, estado: 'cancelled', ya_cancelada: true }
                });
            }

            if (intencion.estado === 'processing') {
                return res.status(409).json({
                    success: false,
                    error: 'Este cobro tiene un pago en proceso y no puede cancelarse. Espera a que el comprador termine o a que venza.'
                });
            }

            if (intencion.estado !== 'pending') {
                return res.status(409).json({
                    success: false,
                    error: `No puedes cancelar un cobro en estado "${intencion.estado}"`
                });
            }

            const { data: actualizada, error: errUpd } = await supabaseAdmin
                .from('pay_intenciones')
                .update({ estado: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', intencionId)
                .eq('estado', 'pending')
                .select('id')
                .maybeSingle();

            if (errUpd) {
                logger.error(`[Pay Intenciones] Error cancelando: ${errUpd.message}`);
                return res.status(500).json({
                    success: false,
                    error: 'Error cancelando la intención'
                });
            }

            if (!actualizada) {
                return res.status(409).json({
                    success: false,
                    error: 'El cobro cambió de estado mientras lo cancelabas. Revisa el estado actual.'
                });
            }

            logger.info(`[Pay Intenciones] Cancelada ${intencionId} por usuario ${usuarioId}`);

            return res.status(200).json({
                success: true,
                data: { id: intencionId, estado: 'cancelled' }
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