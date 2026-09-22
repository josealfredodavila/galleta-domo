// ================================================================
// SERVICES/PAY/RETIROS.JS
// CSARIEL'S PAY - SERVICIO DE RETIROS CON MISMO RIEL
// ================================================================
// Maneja el ciclo completo de un retiro:
//   1. Solicitud del usuario (validaciones + pay_reservar_retiro)
//   2. Validación de mismo riel (el saldo debe venir del mismo método)
//   3. Guardar metadata sensible (CLABE completa, wallet)
//   4. Envío al proveedor (crearPayout en el adapter)
//   5. Cierre por webhook (pay_cerrar_retiro)
//
// REGLAS:
//   - Mismo riel: solo se puede retirar por el riel donde se cobró.
//   - SPEI: cobros por SPEI se retiran por SPEI.
//   - Crypto: cobros por crypto se retiran por crypto.
//   - Tarjeta: cobros por tarjeta quedan BLOQUEADOS hasta que se
//     habilite retiro por tarjeta (Stripe Connect).
//
// La RPC pay_reservar_retiro es la ÚNICA que toca pay_saldos.
// Desde Node nunca modificamos saldos directamente.
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
const MONTO_MINIMO_RETIRO_MXN = 50;
const MONTO_MAXIMO_RETIRO_MXN = 500000;

// Mapeo de método -> proveedor
const METODO_A_PROVEEDOR = {
    spei: 'fintoc',
    crypto: 'nowpayments',
    tarjeta: 'stripe'
};

// Moneda destino por método
const MONEDA_DESTINO_POR_METODO = {
    spei: 'MXN',
    crypto: null,
    tarjeta: 'MXN'
};

// Rieles habilitados para RETIRO (tarjeta no está habilitado aún)
const RIELES_RETIRABLES = ['spei', 'crypto'];

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
// CALCULAR SALDO POR RIEL
// ================================================================
// Calcula cuánto saldo disponible tiene el usuario en un riel específico.
//
// Lógica:
//   1. Consulta las intenciones pagadas del usuario (pay_intenciones).
//   2. Suma los montos agrupados por método de pago.
//   3. Resta los retiros ya completados/procesados por ese método.
//   4. Devuelve el saldo disponible por riel.
// ================================================================

async function calcularSaldoPorRiel(cuentaId) {
    verificarSupabaseAdmin();

    // 1) Traer todas las intenciones pagadas de la cuenta
    const { data: intenciones, error: errInt } = await supabaseAdmin
        .from('pay_intenciones')
        .select('id, monto, metodo_pago, estado, paid_at')
        .eq('cuenta_receptora_id', cuentaId)
        .eq('estado', 'paid');

    if (errInt) {
        logger.error(`[Pay Retiros] Error consultando intenciones: ${errInt.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errInt.message);
    }

    // 2) Traer todos los retiros activos o completados de la cuenta
    const { data: retiros, error: errRet } = await supabaseAdmin
        .from('pay_retiros')
        .select('id, monto_mxn, metodo, estado')
        .eq('cuenta_id', cuentaId)
        .in('estado', ['pending', 'processing', 'completed']);

    if (errRet) {
        logger.error(`[Pay Retiros] Error consultando retiros: ${errRet.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errRet.message);
    }

    // 3) Sumar cobros por riel
    const cobrosPorRiel = {
        spei: 0,
        crypto: 0,
        tarjeta: 0
    };

    for (const intencion of intenciones || []) {
        const metodo = intencion.metodo_pago;
        const monto = Number(intencion.monto) || 0;

        if (metodo === 'spei') {
            cobrosPorRiel.spei += monto;
        } else if (metodo === 'usdt' || metodo === 'usdc') {
            cobrosPorRiel.crypto += monto;
        } else if (metodo === 'tarjeta') {
            cobrosPorRiel.tarjeta += monto;
        }
    }

    // 4) Sumar retiros por riel (ya sea pending, processing o completed)
    const retirosPorRiel = {
        spei: 0,
        crypto: 0,
        tarjeta: 0
    };

    for (const retiro of retiros || []) {
        const metodo = retiro.metodo;
        const monto = Number(retiro.monto_mxn) || 0;

        if (metodo === 'spei') {
            retirosPorRiel.spei += monto;
        } else if (metodo === 'crypto') {
            retirosPorRiel.crypto += monto;
        } else if (metodo === 'tarjeta') {
            retirosPorRiel.tarjeta += monto;
        }
    }

    // 5) Calcular saldo disponible por riel
    const saldoPorRiel = {
        spei: Math.max(0, Math.round((cobrosPorRiel.spei - retirosPorRiel.spei) * 100) / 100),
        crypto: Math.max(0, Math.round((cobrosPorRiel.crypto - retirosPorRiel.crypto) * 100) / 100),
        tarjeta: Math.max(0, Math.round((cobrosPorRiel.tarjeta - retirosPorRiel.tarjeta) * 100) / 100)
    };

    return {
        cobros: cobrosPorRiel,
        retiros: retirosPorRiel,
        disponible: saldoPorRiel
    };
}

// ================================================================
// VALIDAR MISMO RIEL
// ================================================================
// Verifica que el usuario tenga saldo suficiente en el riel elegido.
// ================================================================

async function validarMismoRiel(cuentaId, metodo, monto) {
    // Si el riel no está habilitado para retiro, rechazar
    if (!RIELES_RETIRABLES.includes(metodo)) {
        throw new errors.ErrorAutorizacion(
            'RIEL_NO_HABILITADO',
            `El retiro por ${metodo} no está disponible todavía. ` +
            `Los cobros por ${metodo} se acumulan en tu saldo y podrán retirarse cuando se habilite.`
        );
    }

    const saldos = await calcularSaldoPorRiel(cuentaId);

    const saldoRiel = saldos.disponible[metodo] || 0;

    if (saldoRiel < monto) {
        const saldoTotal = Object.values(saldos.disponible).reduce(function (acc, v) { return acc + v; }, 0);

        // Mensaje inteligente: si tiene saldo total suficiente pero no en ese riel
        if (saldoTotal >= monto) {
            throw new errors.ErrorAutorizacion(
                'SALDO_RIEL_INSUFICIENTE',
                `Solo tienes $${saldoRiel.toFixed(2)} MXN disponibles en ${metodo.toUpperCase()}. ` +
                `Puedes retirar hasta ese monto por este método. ` +
                `Si quieres retirar más, cobra por ${metodo.toUpperCase()}.`
            );
        }

        throw errors.errorSaldoInsuficiente(saldoRiel, monto);
    }

    return {
        saldo_riel: saldoRiel,
        saldo_total: Object.values(saldos.disponible).reduce(function (acc, v) { return acc + v; }, 0),
        saldos_detalle: saldos.disponible
    };
}

// ================================================================
// VALIDAR DESTINO SEGÚN MÉTODO
// ================================================================

function validarDestino(datos) {
    const metodo = datos.metodo;

    if (metodo === 'spei') {
        const clabe = datos.clabeDestino || (datos.datosExtra && datos.datosExtra.clabe_destino);

        if (!clabe || !/^\d{18}$/.test(String(clabe))) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'SPEI requiere CLABE completa de 18 dígitos (datosExtra.clabe_destino)'
            });
        }

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

    throw errors.errorMetodoInvalido(metodo);
}

// ================================================================
// CARGAR ADAPTER DE PAYOUT
// ================================================================

function cargarAdapterPayout(proveedor) {
    if (proveedor === 'stripe') {
        try {
            const adapter = require('./providers/stripe-connect');
            if (typeof adapter.crearPayout !== 'function') {
                throw new Error('stripe-connect no expone crearPayout');
            }
            return adapter;
        } catch (errCarga) {
            throw errors.errorProveedorNoConfigurado(
                'stripe-connect (retiros por tarjeta no habilitados todavía)'
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

async function cerrarRetiroConProveedor(retiroId, estado, providerData) {
    verificarSupabaseAdmin();

    const pd = providerData || {};

    const { data, error } = await supabaseAdmin.rpc('pay_cerrar_retiro', {
        p_retiro_id: retiroId,
        p_estado: estado,
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
// GUARDAR METADATA SENSIBLE POST-RESERVA
// ================================================================

async function guardarMetadataSensible(retiroId, metodo, datosExtra) {
    const de = datosExtra || {};
    const metadata = {};

    if (metodo === 'spei' && de.clabe_destino) {
        metadata.clabe_destino = String(de.clabe_destino);
    }

    if (metodo === 'crypto' && de.wallet_destino) {
        metadata.wallet_destino_completa = String(de.wallet_destino);
    }

    if (Object.keys(metadata).length === 0) {
        return;
    }

    const { error } = await supabaseAdmin
        .from('pay_retiros')
        .update({
            metadata: metadata,
            updated_at: new Date().toISOString()
        })
        .eq('id', retiroId);

    if (error) {
        logger.warning(`[Pay Retiros] No se pudo guardar metadata sensible: ${error.message}`);
    }
}

// ================================================================
// SOLICITAR RETIRO
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
        monedaDestino: d.monedaDestino,
        clabeDestino: d.clabeDestino,
        datosExtra: d.datosExtra
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

    const codigoPais = (d.datosExtra && d.datosExtra.pais) || 'MX';

    if (!paises.esPaisSoportado(codigoPais)) {
        throw errors.errorPaisNoSoportado(codigoPais);
    }

    // ---------- VALIDAR MISMO RIEL ----------
    // Verifica que el usuario tenga saldo suficiente en el riel elegido.
    // Si no lo tiene, rechaza el retiro con mensaje claro.
    await validarMismoRiel(d.cuentaId, metodo, monto);

    const proveedor = METODO_A_PROVEEDOR[metodo];

    // ---------- Reservar el retiro (RPC) ----------
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

        const msg = errReserva.message || '';
        if (msg.includes('INSUFFICIENT_AVAILABLE_BALANCE')) {
            // Mensaje claro: el saldo total alcanza pero el riel no
            const saldos = await calcularSaldoPorRiel(d.cuentaId).catch(function () { return null; });
            const saldoRiel = saldos && saldos.disponible ? (saldos.disponible[metodo] || 0) : 0;
            throw errors.errorSaldoInsuficiente(saldoRiel, monto);
        }
        if (msg.includes('PARAMETRO_REQUERIDO') || msg.includes('PARAMETRO_INVALIDO')) {
            throw errors.errorParametroRequerido(msg);
        }

        throw new errors.ErrorInterno('ERROR_RESERVANDO_RETIRO', msg);
    }

    if (!retiroId) {
        throw new errors.ErrorInterno('ERROR_RESERVANDO_RETIRO', 'sin retiro_id');
    }

    // ---------- GUARDAR METADATA SENSIBLE ----------
    await guardarMetadataSensible(retiroId, metodo, d.datosExtra);

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

    // ---------- Si ya estaba en estado final, devolverlo ----------
    if (ESTADOS_RETIRO_FINALES.includes(retiro.estado)) {
        logger.info(`[Pay Retiros] Retiro ${retiroId} ya en estado final (${retiro.estado})`);
        return retiro;
    }

    // ---------- Delegar al proveedor ----------
    let adapter;
    try {
        adapter = cargarAdapterPayout(proveedor);
    } catch (errAdapter) {
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

    // ---------- Crear el payout ----------
    let resultadoPayout;
    try {
        resultadoPayout = await adapter.crearPayout(retiro);
    } catch (errPayout) {
        logger.error(`[Pay Retiros] Error creando payout ${proveedor}: ${errPayout.message}`);

        const reintentable = errors.esErrorReintentable(errPayout);

        if (reintentable) {
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

    // ---------- Actualizar el retiro con datos del proveedor ----------
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

async function procesarWebhookRetiro(proveedor, req) {
    verificarSupabaseAdmin();

    if (!proveedor || !paises.PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'proveedor desconocido');
    }

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

    if (resultado.accion !== 'cerrar_retiro' || !resultado.retiro_id) {
        await marcarEventoProcesado(proveedor, resultado.event_id, null, true);
        return { status: 'ignorado', event_id: resultado.event_id };
    }

    const ps = (resultado.provider_status || '').toLowerCase();
    let estadoFinal = null;

    if (['succeeded', 'completed', 'success', 'finished', 'paid'].includes(ps)) {
        estadoFinal = 'completed';
    } else if (['failed', 'rejected', 'returned', 'return_pending'].includes(ps)) {
        estadoFinal = 'failed';
    } else if (['cancelled', 'canceled'].includes(ps)) {
        estadoFinal = 'cancelled';
    }

    if (!estadoFinal) {
        await marcarEventoProcesado(proveedor, resultado.event_id, null, true);
        return {
            status: 'ok',
            accion: 'estado_no_final',
            provider_status: ps
        };
    }

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
// OBTENER UN RETIRO
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
    calcularSaldoPorRiel: calcularSaldoPorRiel,
    validarMismoRiel: validarMismoRiel,

    ESTADOS_RETIRO_FINALES: ESTADOS_RETIRO_FINALES,
    ESTADOS_RETIRO_ACTIVOS: ESTADOS_RETIRO_ACTIVOS,
    METODO_A_PROVEEDOR: METODO_A_PROVEEDOR,
    RIELES_RETIRABLES: RIELES_RETIRABLES,
    MONTO_MINIMO_RETIRO_MXN: MONTO_MINIMO_RETIRO_MXN,
    MONTO_MAXIMO_RETIRO_MXN: MONTO_MAXIMO_RETIRO_MXN
};