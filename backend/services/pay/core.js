// ================================================================
// SERVICES/PAY/CORE.JS
// CSARIEL'S PAY - PAYMENT CORE
// ================================================================
// Cambios de esta versión:
//   - Confirmación idempotente: si pay_confirmar_intencion responde
//     idempotent=true, NO se reporta 'intencion_confirmada', así que
//     webhooks.js no vuelve a liberar saldo (evita doble liberación).
//   - Retiros: los webhooks de payout (transfer.outbound.*) cierran el
//     retiro con retirosService.cerrarRetiro. 'succeeded' -> completed;
//     'failed'/'rejected' -> failed (devuelve saldo, idempotente).
//   - Moneda de la intención fija en MXN (el monto siempre es MXN; la
//     conversión a cripto la hace el proveedor).
// ================================================================

'use strict';

const crypto = require('crypto');

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');

const paises = require('./geo/paises');
const errors = require('./errors');
const retirosService = require('./retiros');

// ================================================================
// VALIDACIÓN DE DEPENDENCIAS AL ARRANQUE
// ================================================================

(function validarDependenciasPaises() {
    const requeridosFunciones = [
        'normalizarCodigoPais',
        'esPaisSoportado',
        'metodoEstaPermitido',
        'proveedorParaMetodo',
        'metodosDisponiblesConProveedor',
        'obtenerPais'
    ];

    const requeridosArrays = [
        'METODOS_VALIDOS_GLOBAL',
        'PROVEEDORES_VALIDOS_GLOBAL'
    ];

    const faltantes = [];

    requeridosFunciones.forEach(fn => {
        if (typeof paises[fn] !== 'function') {
            faltantes.push(`paises.${fn} (función)`);
        }
    });

    requeridosArrays.forEach(arr => {
        if (!Array.isArray(paises[arr])) {
            faltantes.push(`paises.${arr} (array)`);
        }
    });

    if (!paises.PAIS_POR_DEFECTO) {
        faltantes.push('paises.PAIS_POR_DEFECTO (string)');
    }

    if (faltantes.length > 0) {
        logger.error('[Pay Core] ❌ Faltan dependencias en services/pay/geo/paises.js:');
        faltantes.forEach(f => logger.error(`   - ${f}`));
    }
})();

// ================================================================
// CONSTANTES
// ================================================================

const ESTADOS_CUENTA_ACTIVA = ['activa'];

// El monto de una intención siempre está en MXN. Para cripto el proveedor
// calcula la cantidad en USDT/USDC con su propio tipo de cambio.
const MONEDA_INTENCION = 'MXN';

// Se conserva por compatibilidad con otros módulos que lo importen.
const MONEDA_POR_METODO = {
    tarjeta: 'MXN',
    spei: 'MXN',
    usdt: 'MXN',
    usdc: 'MXN'
};

const EXPIRACION_INTENCION_MS = 30 * 60 * 1000;

// ================================================================
// HELPERS INTERNOS
// ================================================================

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

function generarPublicToken() {
    return crypto.randomBytes(24).toString('base64url');
}

function normalizarMonto(monto) {
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }
    return Math.round(n * 100) / 100;
}

function normalizarMetodo(metodo) {
    if (!metodo || typeof metodo !== 'string') return null;
    if (!Array.isArray(paises.METODOS_VALIDOS_GLOBAL)) {
        logger.error('[Pay Core] paises.METODOS_VALIDOS_GLOBAL no es un array');
        return null;
    }
    const m = metodo.trim().toLowerCase();
    return paises.METODOS_VALIDOS_GLOBAL.includes(m) ? m : null;
}

function validarIdempotencyKey(key) {
    if (!key || typeof key !== 'string') {
        return null;
    }
    const limpia = key.trim();
    if (limpia.length < 8 || limpia.length > 200) {
        return null;
    }
    return limpia;
}

// ================================================================
// ASEGURAR CUENTA PAY
// ================================================================

async function asegurarCuentaPay(usuarioId, opciones) {
    verificarSupabaseAdmin();

    const opts = opciones || {};
    const tipo = opts.tipo;
    const tiendaId = opts.tiendaId || null;
    const repartidorId = opts.repartidorId || null;

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (tipo !== 'vendedor' && tipo !== 'repartidor') {
        throw errors.errorParametroRequerido('tipo (vendedor|repartidor)');
    }

    if (tipo === 'vendedor' && !tiendaId) {
        throw errors.errorParametroRequerido('tiendaId (obligatorio para vendedor)');
    }

    if (tipo === 'repartidor' && !repartidorId) {
        throw errors.errorParametroRequerido('repartidorId (obligatorio para repartidor)');
    }

    let query = supabaseAdmin
        .from('pay_cuentas')
        .select('*')
        .eq('usuario_id', usuarioId)
        .eq('tipo', tipo);

    if (tipo === 'vendedor') {
        query = query.eq('tienda_id', tiendaId);
    } else {
        query = query.eq('repartidor_id', repartidorId);
    }

    const { data: existente, error: errBuscar } = await query.maybeSingle();

    if (errBuscar) {
        logger.error(`[Pay Core] Error buscando cuenta: ${errBuscar.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errBuscar.message);
    }

    if (existente) {
        return existente;
    }

    const nuevaCuenta = {
        usuario_id: usuarioId,
        tipo: tipo,
        estado: 'activa',
        moneda_principal: 'MXN',
        tienda_id: tipo === 'vendedor' ? tiendaId : null,
        repartidor_id: tipo === 'repartidor' ? repartidorId : null
    };

    const { data: creada, error: errInsert } = await supabaseAdmin
        .from('pay_cuentas')
        .insert(nuevaCuenta)
        .select()
        .single();

    if (errInsert) {
        if (errInsert.code === '23505') {
            const { data: reintento } = await query.maybeSingle();
            if (reintento) {
                return reintento;
            }
        }

        logger.error(`[Pay Core] Error creando cuenta: ${errInsert.message}`);
        throw new errors.ErrorInterno('ERROR_CREANDO_CUENTA', errInsert.message);
    }

    const { error: errSaldo } = await supabaseAdmin
        .from('pay_saldos')
        .insert({
            cuenta_id: creada.id,
            disponible_mxn: 0,
            pendiente_mxn: 0
        });

    if (errSaldo && errSaldo.code !== '23505') {
        logger.warn(`[Pay Core] No se pudo crear fila de saldos: ${errSaldo.message}`);
    }

    logger.info(`[Pay Core] Cuenta Pay creada: ${creada.id} (tipo=${tipo})`);

    return creada;
}

// ================================================================
// OBTENER CUENTA PAY DE USUARIO
// ================================================================

async function obtenerCuentaPayDeUsuario(usuarioId) {
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Core] Error obteniendo cuenta: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return data || null;
}

// ================================================================
// OBTENER SALDOS
// ================================================================

async function obtenerSaldos(cuentaId) {
    verificarSupabaseAdmin();

    if (!cuentaId) {
        throw errors.errorParametroRequerido('cuentaId');
    }

    const { data, error } = await supabaseAdmin
        .from('pay_saldos')
        .select('disponible_mxn, pendiente_mxn, updated_at')
        .eq('cuenta_id', cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Core] Error obteniendo saldos: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        return {
            disponible_mxn: 0,
            pendiente_mxn: 0,
            updated_at: null
        };
    }

    return {
        disponible_mxn: Number(data.disponible_mxn) || 0,
        pendiente_mxn: Number(data.pendiente_mxn) || 0,
        updated_at: data.updated_at
    };
}

// ================================================================
// LISTAR MÉTODOS DISPONIBLES POR PAÍS
// ================================================================

function listarMetodosDisponibles(codigoPais) {
    return paises.metodosDisponiblesConProveedor(codigoPais);
}

// ================================================================
// CREAR INTENCIÓN DE COBRO
// ================================================================

async function crearIntencion(datos) {
    verificarSupabaseAdmin();

    const d = datos || {};

    if (!d.cuentaReceptoraId) {
        throw errors.errorParametroRequerido('cuentaReceptoraId');
    }

    const metodo = normalizarMetodo(d.metodo);
    if (!metodo) {
        throw errors.errorMetodoInvalido(d.metodo);
    }

    const monto = normalizarMonto(d.monto);
    if (monto === null) {
        throw errors.errorMontoInvalido();
    }

    const codigoPais = paises.normalizarCodigoPais(d.codigoPais) || paises.PAIS_POR_DEFECTO;

    if (!paises.esPaisSoportado(codigoPais)) {
        throw errors.errorPaisNoSoportado(codigoPais);
    }

    if (!paises.metodoEstaPermitido(codigoPais, metodo)) {
        throw errors.errorMetodoNoDisponibleEnPais(metodo, codigoPais);
    }

    const proveedor = paises.proveedorParaMetodo(codigoPais, metodo);
    if (!proveedor) {
        throw errors.errorMetodoNoDisponibleEnPais(metodo, codigoPais);
    }

    const idempotencyKey = validarIdempotencyKey(d.idempotencyKey);
    if (!idempotencyKey) {
        throw errors.errorIdempotencyKeyFaltante();
    }

    const { data: cuenta, error: errCuenta } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, usuario_id, tipo, estado, tienda_id, repartidor_id')
        .eq('id', d.cuentaReceptoraId)
        .maybeSingle();

    if (errCuenta) {
        logger.error(`[Pay Core] Error verificando cuenta: ${errCuenta.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errCuenta.message);
    }

    if (!cuenta) {
        throw errors.errorCuentaNoEncontrada({ cuenta_id: d.cuentaReceptoraId });
    }

    if (!ESTADOS_CUENTA_ACTIVA.includes(cuenta.estado)) {
        throw errors.errorCuentaNoActiva(cuenta.estado);
    }

    const { data: existente, error: errIdem } = await supabaseAdmin
        .from('pay_intenciones')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

    if (errIdem) {
        logger.error(`[Pay Core] Error verificando idempotencia: ${errIdem.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errIdem.message);
    }

    if (existente) {
        const coincide =
            Number(existente.monto) === monto &&
            existente.cuenta_receptora_id === d.cuentaReceptoraId &&
            existente.metodo_pago === metodo;

        if (!coincide) {
            throw new errors.ErrorConflicto(
                'IDEMPOTENCY_KEY_REUTILIZADA',
                'La idempotency_key ya fue usada con parámetros distintos'
            );
        }

        return existente;
    }

    const publicToken = generarPublicToken();
    const ahora = new Date();
    const expira = new Date(ahora.getTime() + EXPIRACION_INTENCION_MS);

    const metadata = Object.assign(
        {
            pais: codigoPais,
            moneda_local: paises.obtenerPais(codigoPais).moneda_local,
            creada_desde: 'core'
        },
        d.datosExtra && typeof d.datosExtra === 'object' ? d.datosExtra : {}
    );

    const nuevaIntencion = {
        public_token: publicToken,
        pedido_id: d.pedidoId || null,
        cuenta_receptora_id: d.cuentaReceptoraId,
        comprador_id: d.compradorId || null,
        monto: monto,
        moneda: MONEDA_INTENCION,
        metodo_pago: metodo,
        proveedor: proveedor,
        estado: 'pending',
        idempotency_key: idempotencyKey,
        provider_payment_id: null,
        provider_reference: null,
        descripcion: d.descripcion ? String(d.descripcion).slice(0, 500) : null,
        expires_at: expira.toISOString(),
        paid_at: null,
        metadata: metadata
    };

    const { data: creada, error: errInsert } = await supabaseAdmin
        .from('pay_intenciones')
        .insert(nuevaIntencion)
        .select()
        .single();

    if (errInsert) {
        if (errInsert.code === '23505') {
            const { data: reintento } = await supabaseAdmin
                .from('pay_intenciones')
                .select('*')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();

            if (reintento) {
                return reintento;
            }
        }

        logger.error(`[Pay Core] Error creando intención: ${errInsert.message}`);
        throw new errors.ErrorInterno('ERROR_CREANDO_INTENCION', errInsert.message);
    }

    logger.info(
        `[Pay Core] Intención creada: ${creada.id} ` +
        `(${metodo}/${proveedor}/${codigoPais}) monto=${monto} ${MONEDA_INTENCION}`
    );

    return creada;
}

// ================================================================
// OBTENER INTENCIÓN POR TOKEN PÚBLICO
// ================================================================

async function obtenerIntencionPorTokenPublico(publicToken) {
    verificarSupabaseAdmin();

    if (!publicToken || typeof publicToken !== 'string') {
        throw errors.errorParametroRequerido('publicToken');
    }

    const { data, error } = await supabaseAdmin
        .from('pay_intenciones')
        .select(`
            id,
            public_token,
            pedido_id,
            monto,
            moneda,
            metodo_pago,
            proveedor,
            estado,
            descripcion,
            expires_at,
            paid_at,
            metadata,
            created_at
        `)
        .eq('public_token', publicToken.trim())
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Core] Error obteniendo intención por token: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        throw errors.errorIntencionNoEncontrada({ public_token: publicToken });
    }

    const expiradaPorTiempo =
        data.expires_at &&
        new Date(data.expires_at) < new Date() &&
        data.estado === 'pending';

    const pais = (data.metadata && data.metadata.pais) || paises.PAIS_POR_DEFECTO;

    return {
        public_token: data.public_token,
        monto: Number(data.monto) || 0,
        moneda: data.moneda,
        descripcion: data.descripcion,
        estado: expiradaPorTiempo ? 'expired' : data.estado,
        expires_at: data.expires_at,
        paid_at: data.paid_at,
        pedido_id: data.pedido_id,
        pais: pais,
        metodos_disponibles: listarMetodosDisponibles(pais),
        metodo_pago_actual: data.metodo_pago,
        creada_en: data.created_at
    };
}

// ================================================================
// PROCESAR WEBHOOK
// ================================================================

async function procesarWebhook(proveedor, req) {
    verificarSupabaseAdmin();

    if (!proveedor || !Array.isArray(paises.PROVEEDORES_VALIDOS_GLOBAL)) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'proveedor inválido');
    }

    if (!paises.PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'proveedor desconocido');
    }

    let adapter;
    try {
        adapter = require(`./providers/${proveedor}`);
    } catch (errCarga) {
        logger.error(`[Pay Core] Adapter ${proveedor} no disponible: ${errCarga.message}`);
        throw errors.errorProveedorNoConfigurado(proveedor);
    }

    if (typeof adapter.procesarWebhook !== 'function') {
        throw errors.errorProveedorNoConfigurado(proveedor);
    }

    const resultado = await adapter.procesarWebhook(req);

    if (!resultado || typeof resultado !== 'object') {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'adapter no devolvió resultado válido');
    }

    if (!resultado.firma_valida) {
        throw errors.errorFirmaInvalida(proveedor);
    }

    if (!resultado.event_id) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'sin event_id');
    }

    // Registrar evento (idempotencia por proveedor + event_id)
    const { data: registro, error: errReg } = await supabaseAdmin.rpc(
        'pay_registrar_webhook_evento',
        {
            p_proveedor: proveedor,
            p_event_id: String(resultado.event_id),
            p_tipo_evento: resultado.tipo_evento || null,
            p_firma_valida: true,
            p_payload: resultado.payload_crudo || {}
        }
    );

    if (errReg) {
        logger.error(`[Pay Core] Error registrando webhook: ${errReg.message}`);
        throw new errors.ErrorInterno('ERROR_REGISTRANDO_WEBHOOK', errReg.message);
    }

    // Evento ya procesado con éxito: no se vuelve a ejecutar nada.
    // Si está insertado pero sin procesar (reintento tras un fallo o
    // entrega concurrente), se procesa de nuevo: las RPC son idempotentes.
    if (registro && registro.insertado === false && registro.duplicado === true && registro.procesado === true) {
        logger.info(`[Pay Core] Webhook duplicado ignorado: ${proveedor}/${resultado.event_id}`);
        return {
            status: 'duplicado',
            event_id: resultado.event_id,
            proveedor: proveedor
        };
    }

    let accionEjecutada = 'ninguna';
    let cuentaReceptoraId = null;
    let montoConfirmado = null;

    try {
        // ---------- COBRO ----------
        if (resultado.accion === 'confirmar_intencion' && resultado.intencion_id) {
            const { data: intencion, error: errInt } = await supabaseAdmin
                .from('pay_intenciones')
                .select('id, estado, proveedor, cuenta_receptora_id, monto')
                .eq('id', resultado.intencion_id)
                .maybeSingle();

            if (errInt) {
                throw new errors.ErrorInterno('ERROR_DB', errInt.message);
            }

            if (!intencion) {
                logger.warn(`[Pay Core] Webhook apunta a intención inexistente: ${resultado.intencion_id}`);
                await marcarWebhookProcesado(proveedor, resultado.event_id, null);
                return {
                    status: 'ignorado',
                    motivo: 'intencion_inexistente',
                    event_id: resultado.event_id
                };
            }

            if (intencion.estado === 'paid') {
                logger.info(`[Pay Core] Intención ya pagada: ${resultado.intencion_id}`);
                await marcarWebhookProcesado(proveedor, resultado.event_id, null);
                return {
                    status: 'duplicado',
                    motivo: 'intencion_ya_pagada',
                    intencion_id: resultado.intencion_id
                };
            }

            const { data: rpcData, error: errConf } = await supabaseAdmin.rpc(
                'pay_confirmar_intencion',
                {
                    p_intencion_id: resultado.intencion_id,
                    p_proveedor: proveedor,
                    p_provider_transaction_id: resultado.provider_transaction_id || null,
                    p_provider_status: resultado.provider_status || null,
                    p_provider_fee_mxn: resultado.provider_fee_mxn || 0,
                    p_network_fee_mxn: resultado.network_fee_mxn || 0,
                    p_metadata: resultado.metadata || {}
                }
            );

            if (errConf) {
                logger.error(`[Pay Core] Error confirmando intención: ${errConf.message}`);
                throw new errors.ErrorInterno('ERROR_CONFIRMANDO_INTENCION', errConf.message);
            }

            if (rpcData && rpcData.idempotent === true) {
                // Otra entrega ya confirmó esta intención dentro del lock de la RPC.
                // NO se reporta 'intencion_confirmada': así webhooks.js no libera saldo otra vez.
                accionEjecutada = 'intencion_ya_confirmada';
                logger.info(
                    `[Pay Core] Confirmación idempotente, no se libera saldo de nuevo: ` +
                    `${resultado.intencion_id}`
                );
            } else {
                accionEjecutada = 'intencion_confirmada';

                const { data: intencionActualizada } = await supabaseAdmin
                    .from('pay_intenciones')
                    .select('id, cuenta_receptora_id, monto, paid_at')
                    .eq('id', resultado.intencion_id)
                    .maybeSingle();

                const fuente = intencionActualizada || intencion;
                cuentaReceptoraId = fuente.cuenta_receptora_id;
                montoConfirmado = Number(fuente.monto) || null;

                logger.info(
                    `[Pay Core] Intención confirmada: ${resultado.intencion_id} ` +
                    `(${proveedor}/${resultado.provider_transaction_id || 'sin_tx_id'}) ` +
                    `cuenta=${cuentaReceptoraId} monto=${montoConfirmado} ${MONEDA_INTENCION}`
                );
            }

        // ---------- PAYOUT (RETIRO) ----------
        } else if (resultado.accion === 'cerrar_retiro' && resultado.retiro_id) {
            const estadoFinal = resultado.provider_status === 'succeeded' ? 'completed' : 'failed';

            let cierre;
            try {
                cierre = await retirosService.cerrarRetiro(resultado.retiro_id, estadoFinal, {
                    provider_transfer_id: resultado.provider_transaction_id || null,
                    provider_status: resultado.provider_status || null,
                    error_code: estadoFinal === 'failed' ? 'PROVEEDOR_PAYOUT_FALLIDO' : null,
                    error_message: estadoFinal === 'failed'
                        ? `El proveedor reportó ${resultado.provider_status}`
                        : null,
                    metadata: { evento_proveedor: resultado.tipo_evento || null }
                });
            } catch (errCierre) {
                if (String(errCierre && errCierre.message).includes('PAY_RETIRO_NOT_FOUND')) {
                    logger.error(
                        `[Pay Core] Payout ${resultado.event_id} apunta a retiro inexistente: ${resultado.retiro_id}`
                    );
                    await marcarWebhookProcesado(proveedor, resultado.event_id, 'retiro_inexistente');
                    return {
                        status: 'ignorado',
                        motivo: 'retiro_inexistente',
                        event_id: resultado.event_id
                    };
                }
                throw errCierre;
            }

            if (cierre && cierre.already_processed) {
                logger.warn(
                    `[Pay Core] Payout ${resultado.event_id} (${resultado.tipo_evento}) llegó para retiro ` +
                    `${resultado.retiro_id} ya cerrado como ${cierre.estado_final}. Sin cambios en base.`
                );
                accionEjecutada = 'retiro_ya_cerrado';
            } else {
                accionEjecutada = estadoFinal === 'completed'
                    ? 'retiro_completado'
                    : 'retiro_fallido_saldo_devuelto';
                logger.info(`[Pay Core] Retiro ${resultado.retiro_id} cerrado como ${estadoFinal}`);
            }

        } else {
            accionEjecutada = 'ignorada';
        }

        await marcarWebhookProcesado(proveedor, resultado.event_id, null);

        return {
            status: 'ok',
            accion: accionEjecutada,
            event_id: resultado.event_id,
            intencion_id: resultado.intencion_id || null,
            cuenta_receptora_id: cuentaReceptoraId,
            monto_confirmado: montoConfirmado,
            retiro_id: resultado.retiro_id || null
        };

    } catch (errProceso) {
        // Queda procesado=false: el proveedor reintentará y se volverá a ejecutar.
        await marcarWebhookProcesado(
            proveedor,
            resultado.event_id,
            (errProceso && errProceso.message) || 'error desconocido',
            false
        );

        throw errProceso;
    }
}

// ================================================================
// MARCAR WEBHOOK COMO PROCESADO
// ================================================================

async function marcarWebhookProcesado(proveedor, eventId, errorMensaje, marcarExito) {
    try {
        const update = {
            procesado: marcarExito === false ? false : true,
            procesado_en: new Date().toISOString(),
            error: errorMensaje || null
        };

        await supabaseAdmin
            .from('pay_webhook_events')
            .update(update)
            .eq('proveedor', proveedor)
            .eq('event_id', String(eventId));
    } catch (err) {
        logger.warn(`[Pay Core] No se pudo marcar webhook como procesado: ${err.message}`);
    }
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    asegurarCuentaPay: asegurarCuentaPay,
    obtenerCuentaPayDeUsuario: obtenerCuentaPayDeUsuario,
    obtenerSaldos: obtenerSaldos,
    listarMetodosDisponibles: listarMetodosDisponibles,
    crearIntencion: crearIntencion,
    obtenerIntencionPorTokenPublico: obtenerIntencionPorTokenPublico,
    procesarWebhook: procesarWebhook,
    MONEDA_POR_METODO: MONEDA_POR_METODO,
    EXPIRACION_INTENCION_MS: EXPIRACION_INTENCION_MS
};