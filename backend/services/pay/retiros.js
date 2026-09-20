// ================================================================
// SERVICES/PAY/RETIROS.JS
// CSARIEL'S PAY - SERVICIO DE RETIROS
// ================================================================
// Maneja el ciclo completo de un retiro:
//   1. Solicitud del usuario (validaciones + pay_reservar_retiro)
//   2. Envío al proveedor (crearPayout en el adapter)
//   3. Cierre por webhook (pay_cerrar_retiro)
//
// La RPC pay_reservar_retiro es la ÚNICA que toca pay_saldos.
// Desde Node nunca modificamos saldos directamente.
//
// Estados del retiro (pay_retiros.estado):
//   pending     -> reservado, aún no enviado al proveedor
//   processing  -> enviado al proveedor, esperando confirmación
//   completed   -> pagado por el proveedor
//   failed      -> rechazado o falló (saldo devuelto)
//   cancelled   -> cancelado (saldo devuelto)
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const paises = require('./geo/paises');
const errors = require('./errors');

// ================================================================
// CONSTANTES
// ================================================================

const ESTADOS_RETIRO_FINALES = ['completed', 'failed', 'cancelled'];
const ESTADOS_RETIRO_ACTIVOS = ['pending', 'processing'];
const MONTO_MINIMO_RETIRO_MXN = 50;      // Mínimo operativo (ajustable)
const MONTO_MAXIMO_RETIRO_MXN = 500000;  // Máximo por operación (ajustable)

// Método -> proveedor
const METODO_A_PROVEEDOR = {
    spei: 'fintoc',
    crypto: 'nowpayments',
    tarjeta: 'stripe'
};

// Moneda destino válida por método
const MONEDA_DESTINO_POR_METODO = {
    spei: 'MXN',
    crypto: null,   // Se define por redCrypto (USDT o USDC)
    tarjeta: 'MXN'
};

// ================================================================
// HELPERS INTERNOS
// ================================================================

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

function normalizarMonto(monto) {
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }
    return Math.round(n * 100) / 100;
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
// VALIDAR DESTINO SEGÚN MÉTODO
// ================================================================
// SPEI        -> requiere CLABE de 18 dígitos (destinoUltimos4 = últimos 4)
// crypto      -> requiere wallet_destino + red_crypto
// tarjeta     -> se define con Stripe Connect (destino_ultimos4)
// ================================================================

function validarDestino(datos) {
    const metodo = datos.metodo;

    if (metodo === 'spei') {
        if (!datos.destinoUltimos4 || !/^\d{4}$/.test(String(datos.destinoUltimos4))) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'SPEI requiere destino_ultimos4 (4 dígitos)'
            });
        }
        return;
    }

    if (metodo === 'crypto') {
        if (!datos.walletDestino || typeof datos.walletDestino !== 'string' || datos.walletDestino.length < 20) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Crypto requiere wallet_destino'
            });
        }

        if (!datos.redCrypto || typeof datos.redCrypto !== 'string') {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Crypto requiere red_crypto (ej: usdttrc20)'
            });
        }

        if (!datos.monedaDestino || !['USDT', 'USDC'].includes(datos.monedaDestino)) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Crypto requiere moneda_destino USDT o USDC'
            });
        }
        return;
    }

    if (metodo === 'tarjeta') {
        if (!datos.destinoUltimos4 || !/^\d{4}$/.test(String(datos.destinoUltimos4))) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Tarjeta requiere destino_ultimos4 (4 dígitos)'
            });
        }
        return;
    }

    throw errors.errorMetodoInvalido(metodo);
}

// ================================================================
// CARGAR ADAPTER DE PAYOUT
// ================================================================

function cargarAdapterPayout(proveedor) {
    if (proveedor === 'stripe') {
        // Stripe Connect no implementado aún. Falla controladamente.
        try {
            const adapter = require('./providers/stripe-connect');
            if (typeof adapter.crearPayout !== 'function') {
                throw new Error('stripe-connect no expone crearPayout');
            }
            return adapter;
        } catch (errCarga) {
            throw errors.errorProveedorNoConfigurado(
                'stripe-connect (payouts no implementados todavía)'
            );
        }
    }

    try {
        const adapter = require(`./providers/${proveedor}`);
        if (typeof adapter.crearPayout !== 'function') {
            throw new Error(`adapter ${proveedor} no expone crearPayout`);
        }
        return adapter;
    } catch (errCarga) {
        logger.error(`[Pay Retiros] Adapter ${proveedor} sin crearPayout: ${errCarga.message}`);
        throw errors.errorProveedorNoConfigurado(proveedor);
    }
}

// ================================================================
// CERRAR RETIRO CON RESULTADO DEL PROVEEDOR
// ================================================================
// Envuelve pay_cerrar_retiro para tener un único punto de cierre.
// ================================================================

async function cerrarRetiroConProveedor(retiroId, estado, providerData) {
    verificarSupabaseAdmin();

    const pd = providerData || {};

    const { data, error } = await supabaseAdmin.rpc('pay_cerrar_retiro', {
        p_retiro_id: retiroId,
        p_estado: estado,                              // 'completed' | 'failed' | 'cancelled'
        p_provider_transfer_id: pd.provider_transfer_id || null,
        p_provider_status: pd.provider_status || null,
        p_error_code: pd.error_code || null,
        p_error_message: pd.error_message || null,
        p_metadata: pd.metadata || {}
    });

    if (error) {
        logger.error(`[Pay Retiros] Error cerrando retiro ${retiroId}: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_CERRANDO_RETIRO', error.message);
    }

    return data;
}

// ================================================================
// SOLICITAR RETIRO
// ================================================================
// Args:
//   datos:
//     usuarioId        -> uuid (para ownership)
//     cuentaId         -> uuid de pay_cuentas
//     montoMxn         -> number
//     metodo           -> 'spei' | 'crypto' | 'tarjeta'
//     monedaDestino    -> 'MXN' | 'USDT' | 'USDC'
//     destinoUltimos4  -> string (4 dígitos) para SPEI y tarjeta
//     redCrypto        -> string (ej 'usdttrc20') para crypto
//     walletDestino    -> string (dirección) para crypto
//     idempotencyKey   -> string único
//     datosExtra       -> objeto opcional (metadata adicional)
//
// Devuelve: la fila del retiro creado (con datos de pay_retiros).
// ================================================================

async function solicitarRetiro(datos) {
    verificarSupabaseAdmin();

    const d = datos || {};

    // ---------- Validaciones de entrada ----------
    if (!d.usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!d.cuentaId) {
        throw errors.errorParametroRequerido('cuentaId');
    }

    const monto = normalizarMonto(d.montoMxn);
    if (monto === null) {
        throw errors.errorMontoInvalido();
    }

    if (monto < MONTO_MINIMO_RETIRO_MXN) {
        throw errors.errorMontoInvalido({
            monto_minimo_mxn: MONTO_MINIMO_RETIRO_MXN,
            monto_solicitado_mxn: monto
        });
    }

    if (monto > MONTO_MAXIMO_RETIRO_MXN) {
        throw errors.errorMontoInvalido({
            monto_maximo_mxn: MONTO_MAXIMO_RETIRO_MXN,
            monto_solicitado_mxn: monto
        });
    }

    const metodo = d.metodo && typeof d.metodo === 'string' ? d.metodo.trim().toLowerCase() : null;
    if (!metodo || !METODO_A_PROVEEDOR[metodo]) {
        throw errors.errorMetodoInvalido(metodo);
    }

    const idempotencyKey = validarIdempotencyKey(d.idempotencyKey);
    if (!idempotencyKey) {
        throw errors.errorIdempotencyKeyFaltante();
    }

    // Validar destino según método
    validarDestino({
        metodo: metodo,
        destinoUltimos4: d.destinoUltimos4,
        redCrypto: d.redCrypto,
        walletDestino: d.walletDestino,
        monedaDestino: d.monedaDestino
    });

    // ---------- Verificar ownership de la cuenta ----------
    const { data: cuenta, error: errCuenta } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, usuario_id, tipo, estado, tienda_id, repartidor_id')
        .eq('id', d.cuentaId)
        .maybeSingle();

    if (errCuenta) {
        logger.error(`[Pay Retiros] Error verificando cuenta: ${errCuenta.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errCuenta.message);
    }

    if (!cuenta) {
        throw errors.errorCuentaNoEncontrada({ cuenta_id: d.cuentaId });
    }

    if (cuenta.usuario_id !== d.usuarioId) {
        throw errors.errorNoEsPropietario();
    }

    if (cuenta.estado !== 'activa') {
        throw errors.errorCuentaNoActiva(cuenta.estado);
    }

    // ---------- Verificar país (por metadata del pedido, o MX por defecto) ----------
    // El país se resuelve por el país del usuario. Asumimos MX si no hay dato.
    // A futuro, cuando tengas `usuarios.pais`, se lee de ahí.
    const codigoPais = (d.datosExtra && d.datosExtra.pais) || 'MX';

    if (!paises.esPaisSoportado(codigoPais)) {
        throw errors.errorPaisNoSoportado(codigoPais);
    }

    const proveedor = METODO_A_PROVEEDOR[metodo];

    // ---------- Verificar saldo antes de intentar reservar ----------
    const { data: saldos, error: errSaldos } = await supabaseAdmin
        .from('pay_saldos')
        .select('disponible_mxn, pendiente_mxn')
        .eq('cuenta_id', d.cuentaId)
        .maybeSingle();

    if (errSaldos) {
        logger.error(`[Pay Retiros] Error consultando saldos: ${errSaldos.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errSaldos.message);
    }

    const disponible = saldos ? Number(saldos.disponible_mxn) || 0 : 0;

    if (disponible < monto) {
        throw errors.errorSaldoInsuficiente(disponible, monto);
    }

    // ---------- Reservar el retiro (RPC) ----------
    // pay_reservar_retiro hace: idempotencia + lock + verificación +
    // descuento de saldo + INSERT en pay_retiros + movimiento.
    const { data: retiroId, error: errReserva } = await supabaseAdmin.rpc(
        'pay_reservar_retiro',
        {
            p_cuenta_id: d.cuentaId,
            p_monto_mxn: monto,
            p_idempotency_key: idempotencyKey,
            p_metodo: metodo,
            p_moneda_destino: d.monedaDestino || MONEDA_DESTINO_POR_METODO[metodo] || 'MXN',
            p_proveedor: proveedor,
            p_destino_ultimos4: d.destinoUltimos4 || null,
            p_red_crypto: d.redCrypto || null,
            p_wallet_destino: d.walletDestino || null
        }
    );

    if (errReserva) {
        logger.error(`[Pay Retiros] Error reservando retiro: ${errReserva.message}`);

        // Errores conocidos de la RPC
        const msg = errReserva.message || '';
        if (msg.includes('INSUFFICIENT_AVAILABLE_BALANCE')) {
            throw errors.errorSaldoInsuficiente(disponible, monto);
        }
        if (msg.includes('PARAMETRO_REQUERIDO') || msg.includes('PARAMETRO_INVALIDO')) {
            throw errors.errorParametroRequerido(msg);
        }

        throw new errors.ErrorInterno('ERROR_RESERVANDO_RETIRO', msg);
    }

    if (!retiroId) {
        throw new errors.ErrorInterno('ERROR_RESERVANDO_RETIRO', 'sin retiro_id');
    }

    // ---------- Cargar el retiro recién creado ----------
    const { data: retiro, error: errGet } = await supabaseAdmin
        .from('pay_retiros')
        .select('*')
        .eq('id', retiroId)
        .single();

    if (errGet || !retiro) {
        logger.error(`[Pay Retiros] Retiro creado pero no recuperable: ${errGet ? errGet.message : 'sin datos'}`);
        throw new errors.ErrorInterno('ERROR_CARGANDO_RETIRO', errGet ? errGet.message : 'sin datos');
    }

    // ---------- Si el retiro ya estaba en estado final, devolverlo ----------
    // (idempotencia: otra llamada con la misma key ya lo cerró)
    if (ESTADOS_RETIRO_FINALES.includes(retiro.estado)) {
        logger.info(`[Pay Retiros] Retiro ${retiroId} ya en estado final (${retiro.estado})`);
        return retiro;
    }

    // ---------- Delegar al proveedor ----------
    let adapter;
    try {
        adapter = cargarAdapterPayout(proveedor);
    } catch (errAdapter) {
        // No podemos cerrar aquí sin más, porque el retiro ya se reservó.
        // Cerramos como failed para devolver el saldo.
        logger.error(`[Pay Retiros] Sin adapter para ${proveedor}: ${errAdapter.message}`);

        try {
            await cerrarRetiroConProveedor(retiroId, 'failed', {
                provider_status: 'adapter_no_disponible',
                error_code: 'ADAPTER_NO_DISPONIBLE',
                error_message: errAdapter.message
            });
        } catch (errCierre) {
            logger.error(`[Pay Retiros] Error cerrando retiro tras fallo de adapter: ${errCierre.message}`);
        }

        throw errAdapter;
    }

    // ---------- Crear el payout en el proveedor ----------
    let resultadoPayout;
    try {
        resultadoPayout = await adapter.crearPayout(retiro);
    } catch (errPayout) {
        logger.error(`[Pay Retiros] Error creando payout ${proveedor}: ${errPayout.message}`);

        const reintentable = errors.esErrorReintentable(errPayout);

        if (reintentable) {
            // El retiro queda en 'pending' (o 'processing' si el adapter
            // alcanzó a registrar algo). No cerramos: esperamos webhook
            // o job de reconciliación.
            logger.warning(
                `[Pay Retiros] Retiro ${retiroId} queda pendiente por error reintentable de ${proveedor}`
            );

            await supabaseAdmin
                .from('pay_retiros')
                .update({
                    provider_status: 'temporal_error',
                    error_code: errPayout.code || 'PROVEEDOR_ERROR_TEMPORAL',
                    error_message: (errPayout.message || '').slice(0, 500),
                    updated_at: new Date().toISOString()
                })
                .eq('id', retiroId);

            throw errPayout;
        }

        // Error permanente: cerrar como failed (devuelve saldo).
        try {
            await cerrarRetiroConProveedor(retiroId, 'failed', {
                provider_transfer_id: errPayout.detalles && errPayout.detalles.provider_transfer_id,
                provider_status: 'rechazado',
                error_code: errPayout.code || 'PROVEEDOR_RECHAZO',
                error_message: (errPayout.message || '').slice(0, 500),
                metadata: errPayout.detalles || {}
            });
        } catch (errCierre) {
            logger.error(`[Pay Retiros] Error cerrando retiro tras fallo permanente: ${errCierre.message}`);
        }

        throw errPayout;
    }

    // ---------- Actualizar el retiro con los datos del proveedor ----------
    const actualizacion = {
        estado: resultadoPayout.estado_inmediato || 'processing',
        provider_transfer_id: resultadoPayout.provider_transfer_id || null,
        provider_status: resultadoPayout.provider_status || 'processing',
        provider_destination_id: resultadoPayout.provider_destination_id || null,
        metadata: Object.assign({}, retiro.metadata || {}, resultadoPayout.metadata || {}),
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: retiroActualizado, error: errUpdate } = await supabaseAdmin
        .from('pay_retiros')
        .update(actualizacion)
        .eq('id', retiroId)
        .select()
        .single();

    if (errUpdate) {
        logger.error(`[Pay Retiros] Error actualizando retiro tras payout: ${errUpdate.message}`);
        // El payout ya se hizo. Devolvemos el retiro tal cual lo teníamos.
        return retiro;
    }

    logger.info(
        `[Pay Retiros] Retiro ${retiroId} enviado a ${proveedor}: ` +
        `${retiroActualizado.estado} (${resultadoPayout.provider_transfer_id || 'sin_tx_id'})`
    );

    return retiroActualizado;
}

// ================================================================
// PROCESAR WEBHOOK DE RETIRO
// ================================================================
// Se llama desde routes/pay/webhooks.js cuando llega un webhook
// marcado como 'retiro'.
// ================================================================

async function procesarWebhookRetiro(proveedor, req) {
    verificarSupabaseAdmin();

    if (!proveedor || !paises.PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'proveedor desconocido');
    }

    // Cargar adapter
    let adapter;
    try {
        adapter = require(`./providers/${proveedor}`);
    } catch (errCarga) {
        throw errors.errorProveedorNoConfigurado(proveedor);
    }

    if (typeof adapter.procesarWebhook !== 'function') {
        throw errors.errorProveedorNoConfigurado(proveedor);
    }

    const resultado = await adapter.procesarWebhook(req);

    if (!resultado || typeof resultado !== 'object') {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'adapter sin resultado');
    }

    if (!resultado.firma_valida) {
        throw errors.errorFirmaInvalida(proveedor);
    }

    // ---------- Registrar evento ----------
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
        logger.error(`[Pay Retiros] Error registrando webhook: ${errReg.message}`);
        throw new errors.ErrorInterno('ERROR_REGISTRANDO_WEBHOOK', errReg.message);
    }

    if (registro && registro.insertado === false && registro.duplicado === true && registro.procesado === true) {
        return { status: 'duplicado', event_id: resultado.event_id };
    }

    // ---------- Determinar estado final ----------
    if (resultado.accion !== 'cerrar_retiro' || !resultado.retiro_id) {
        // No es un evento de payout que nos interese cerrar.
        await marcarEventoProcesado(proveedor, resultado.event_id, null, true);
        return { status: 'ignorado', event_id: resultado.event_id };
    }

    // Traducir provider_status a estado interno
    const ps = (resultado.provider_status || '').toLowerCase();
    let estadoFinal = null;

    if (['succeeded', 'completed', 'success', 'finished'].includes(ps)) {
        estadoFinal = 'completed';
    } else if (['failed', 'rejected', 'returned', 'return_pending'].includes(ps)) {
        estadoFinal = 'failed';
    } else if (['cancelled', 'canceled'].includes(ps)) {
        estadoFinal = 'cancelled';
    }

    if (!estadoFinal) {
        // No es estado final: solo registrar y salir
        await marcarEventoProcesado(proveedor, resultado.event_id, null, true);
        return {
            status: 'ok',
            accion: 'estado_no_final',
            provider_status: ps
        };
    }

    // ---------- Cerrar retiro con pay_cerrar_retiro ----------
    const cierre = await cerrarRetiroConProveedor(resultado.retiro_id, estadoFinal, {
        provider_transfer_id: resultado.provider_transaction_id || null,
        provider_status: resultado.provider_status || null,
        error_code: estadoFinal === 'failed' ? 'PROVEEDOR_FALLO' : null,
        error_message: estadoFinal === 'failed' ? resultado.tipo_evento : null,
        metadata: resultado.metadata || {}
    });

    await marcarEventoProcesado(proveedor, resultado.event_id, null, true);

    logger.info(
        `[Pay Retiros] Retiro ${resultado.retiro_id} cerrado: ${estadoFinal} ` +
        `(already_processed: ${cierre && cierre.already_processed ? 'sí' : 'no'})`
    );

    return {
        status: 'ok',
        accion: 'retiro_cerrado',
        retiro_id: resultado.retiro_id,
        estado_final: estadoFinal,
        already_processed: cierre && cierre.already_processed === true
    };
}

// ================================================================
// MARCAR EVENTO COMO PROCESADO
// ================================================================

async function marcarEventoProcesado(proveedor, eventId, errorMensaje, exito) {
    try {
        await supabaseAdmin
            .from('pay_webhook_events')
            .update({
                procesado: exito === false ? false : true,
                procesado_en: new Date().toISOString(),
                error: errorMensaje || null
            })
            .eq('proveedor', proveedor)
            .eq('event_id', String(eventId));
    } catch (err) {
        logger.warning(`[Pay Retiros] No se pudo marcar evento como procesado: ${err.message}`);
    }
}

// ================================================================
// LISTAR RETIROS
// ================================================================

async function listarRetiros(opciones) {
    verificarSupabaseAdmin();

    const opts = opciones || {};
    const cuentaId = opts.cuentaId;

    if (!cuentaId) {
        throw errors.errorParametroRequerido('cuentaId');
    }

    const limite = Math.min(Math.max(parseInt(opts.limite, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);

    let query = supabaseAdmin
        .from('pay_retiros')
        .select('*', { count: 'exact' })
        .eq('cuenta_id', cuentaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limite - 1);

    if (Array.isArray(opts.estados) && opts.estados.length > 0) {
        query = query.in('estado', opts.estados);
    }

    const { data, error, count } = await query;

    if (error) {
        logger.error(`[Pay Retiros] Error listando retiros: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return {
        retiros: data || [],
        total: count || 0,
        limite: limite,
        offset: offset
    };
}

// ================================================================
// OBTENER UN RETIRO (con verificación de ownership)
// ================================================================

async function obtenerRetiro(opciones) {
    verificarSupabaseAdmin();

    const opts = opciones || {};

    if (!opts.retiroId) {
        throw errors.errorParametroRequerido('retiroId');
    }

    if (!opts.cuentaId) {
        throw errors.errorParametroRequerido('cuentaId');
    }

    const { data, error } = await supabaseAdmin
        .from('pay_retiros')
        .select('*')
        .eq('id', opts.retiroId)
        .eq('cuenta_id', opts.cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Retiros] Error obteniendo retiro: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        throw errors.errorRetiroNoEncontrado({ retiro_id: opts.retiroId });
    }

    return data;
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    solicitarRetiro: solicitarRetiro,
    procesarWebhookRetiro: procesarWebhookRetiro,
    cerrarRetiroConProveedor: cerrarRetiroConProveedor,
    listarRetiros: listarRetiros,
    obtenerRetiro: obtenerRetiro,

    // Constantes exportadas
    ESTADOS_RETIRO_FINALES: ESTADOS_RETIRO_FINALES,
    ESTADOS_RETIRO_ACTIVOS: ESTADOS_RETIRO_ACTIVOS,
    METODO_A_PROVEEDOR: METODO_A_PROVEEDOR,
    MONTO_MINIMO_RETIRO_MXN: MONTO_MINIMO_RETIRO_MXN,
    MONTO_MAXIMO_RETIRO_MXN: MONTO_MAXIMO_RETIRO_MXN
};