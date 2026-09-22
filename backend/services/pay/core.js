// ================================================================
// SERVICES/PAY/CORE.JS
// CSARIEL'S PAY - PAYMENT CORE
// ================================================================
// Punto de entrada único del módulo Pay. Los routers y los
// webhooks hablan CON el Core. El Core habla CON los proveedores
// (Stripe, Fintoc, NOWPayments) a través de adapters.
//
// Responsabilidades:
//   - Validar país + método + monto + moneda
//   - Crear intenciones de cobro (con idempotencia)
//   - Consultar intenciones por token público
//   - Orquestar el procesamiento de webhooks
//   - Asegurar que exista la cuenta Pay de un usuario
//   - Exponer saldos y cuentas
//
// NO hace:
//   - Verificar autenticación (eso lo hace el router)
//   - Hablar con proveedores directamente (eso lo hacen los adapters)
//   - Hacer payouts (eso lo hace retiros.js)
// ================================================================

'use strict';

const crypto = require('crypto');

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');

const paises = require('./geo/paises');
const errors = require('./errors');

// ================================================================
// CONSTANTES
// ================================================================

const ESTADOS_INTENCION_FINALES = ['paid', 'failed', 'expired', 'cancelled', 'refunded'];
const ESTADOS_CUENTA_ACTIVA = ['activa'];
const MONEDAS_VALIDAS = ['MXN', 'USDT', 'USDC'];
const MONEDA_POR_METODO = {
    tarjeta: 'MXN',
    spei: 'MXN',
    usdt: 'USDT',
    usdc: 'USDC'
};
const EXPIRACION_INTENCION_MS = 30 * 60 * 1000; // 30 minutos

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
    const m = metodo.trim().toLowerCase();
    return paises.METODOS_VALIDOS_GLOBAL.includes(m) ? m : null;
}

function normalizarMoneda(moneda) {
    if (!moneda || typeof moneda !== 'string') return null;
    const m = moneda.trim().toUpperCase();
    return MONEDAS_VALIDAS.includes(m) ? m : null;
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
        logger.warning(`[Pay Core] No se pudo crear fila de saldos: ${errSaldo.message}`);
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

    const moneda = normalizarMoneda(d.moneda) || MONEDA_POR_METODO[metodo];
    if (!moneda) {
        throw errors.errorMonedaInvalida(d.moneda);
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
        moneda: moneda,
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
        `(${metodo}/${proveedor}/${codigoPais}) monto=${monto} ${moneda}`
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
// Punto de entrada único para todos los webhooks de proveedor.
//
// Devuelve:
//   {
//     status: 'ok' | 'duplicado' | 'ignorado',
//     accion: 'intencion_confirmada' | 'retiro_pendiente_de_implementar' | 'ignorada' | 'ninguna',
//     event_id,
//     intencion_id,           ← si accion = intencion_confirmada
//     cuenta_receptora_id,    ← NUEVO: para que el webhook libere saldo
//     monto_confirmado,       ← NUEVO: para que el webhook libere saldo
//     retiro_id
//   }
// ================================================================

async function procesarWebhook(proveedor, req) {
    verificarSupabaseAdmin();

    if (!proveedor || !paises.PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
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

    // ---------- 1) Verificar firma ----------
    if (!resultado.firma_valida) {
        throw errors.errorFirmaInvalida(proveedor);
    }

    if (!resultado.event_id) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'sin event_id');
    }

    // ---------- 2) Registrar evento (idempotencia) ----------
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

    if (registro && registro.insertado === false && registro.duplicado === true && registro.procesado === true) {
        logger.info(`[Pay Core] Webhook duplicado ignorado: ${proveedor}/${resultado.event_id}`);
        return {
            status: 'duplicado',
            event_id: resultado.event_id,
            proveedor: proveedor
        };
    }

    // ---------- 3) Ejecutar la acción ----------
    let accionEjecutada = 'ninguna';
    let intencionConfirmada = null;
    let cuentaReceptoraId = null;
    let montoConfirmado = null;

    try {
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
                logger.warning(`[Pay Core] Webhook apunta a intención inexistente: ${resultado.intencion_id}`);
                await marcarWebhookProcesado(proveedor, resultado.event_id, 'intencion_inexistente');
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

            // Llamar a la RPC de confirmación
            const { data: confirmacion, error: errConf } = await supabaseAdmin.rpc(
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

            accionEjecutada = 'intencion_confirmada';

            // Recuperar datos para la liberación de saldo
            // (intención actualizada + cuenta receptora + monto)
            const { data: intencionActualizada } = await supabaseAdmin
                .from('pay_intenciones')
                .select('id, cuenta_receptora_id, monto, paid_at')
                .eq('id', resultado.intencion_id)
                .maybeSingle();

            if (intencionActualizada) {
                intencionConfirmada = intencionActualizada;
                cuentaReceptoraId = intencionActualizada.cuenta_receptora_id;
                montoConfirmado = Number(intencionActualizada.monto) || null;
            } else {
                // Fallback: usar los datos que ya teníamos de la intención
                cuentaReceptoraId = intencion.cuenta_receptora_id;
                montoConfirmado = Number(intencion.monto) || null;
            }

            logger.info(
                `[Pay Core] Intención confirmada: ${resultado.intencion_id} ` +
                `(${proveedor}/${resultado.provider_transaction_id || 'sin_tx_id'}) ` +
                `cuenta=${cuentaReceptoraId} monto=${montoConfirmado}`
            );

        } else if (resultado.accion === 'cerrar_retiro' && resultado.retiro_id) {
            logger.info(`[Pay Core] Webhook de retiro recibido: ${resultado.retiro_id}`);
            accionEjecutada = 'retiro_pendiente_de_implementar';

        } else {
            accionEjecutada = 'ignorada';
        }

        // ---------- 4) Marcar evento como procesado ----------
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
        await marcarWebhookProcesado(
            proveedor,
            resultado.event_id,
            errProceso.message || 'error desconocido',
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
        logger.warning(`[Pay Core] No se pudo marcar webhook como procesado: ${err.message}`);
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