// ================================================================
// SERVICES/PAY/RETIROS.JS
// CSARIEL'S PAY - SERVICIO DE RETIROS
// ================================================================
// Flujo:
//   1. pay_reservar_retiro  -> descuenta saldo y crea el retiro en
//                              'pending' (atómico e idempotente).
//   2. Adapter del proveedor -> envía el payout usando retiro.id como
//                              llave de idempotencia.
//   3. UPDATE directo        -> pending -> processing, guardado por
//                              estado = 'pending' (sin tocar esquema).
//   4. pay_cerrar_retiro     -> 'failed' devuelve saldo;
//                              'completed' confirma el movimiento.
//
// Métodos activos en esta fase: spei (Fintoc) y crypto (NOWPayments).
// Retiro por tarjeta (Stripe Connect) queda fuera de esta fase.
//
// La CLABE completa NO se persiste en la base: solo se guardan los
// últimos 4 dígitos. Los reintentos deben reenviar la CLABE y el titular.
// ================================================================

'use strict';

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const errors = require('./errors');
const fintocPayout = require('./providers/fintoc-payout');
const nowpaymentsPayout = require('./providers/nowpayments-payout');

// ================================================================
// CONSTANTES
// ================================================================

const MONTO_MINIMO_MXN = 50;
const MONTO_MAXIMO_MXN = 500000;
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

const ESTADOS_VALIDOS = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
const ESTADOS_FINALES = ['completed', 'failed', 'cancelled'];
const METODOS_ACTIVOS = ['spei', 'crypto'];

const PROVEEDOR_POR_METODO = {
    spei: 'fintoc',
    crypto: 'nowpayments'
};

const REDES_POR_MONEDA = {
    USDT: ['usdttrc20', 'usdtbsc', 'usdtmatic', 'usdtsol', 'usdterc20'],
    USDC: ['usdcsol', 'usdcmatic', 'usdcbsc', 'usdc']
};

const VALIDADOR_WALLET = {
    usdttrc20: /^T[A-Za-z1-9]{33}$/,
    usdtmatic: /^0x[a-fA-F0-9]{40}$/,
    usdtbsc: /^0x[a-fA-F0-9]{40}$/,
    usdtsol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    usdterc20: /^0x[a-fA-F0-9]{40}$/,
    usdcmatic: /^0x[a-fA-F0-9]{40}$/,
    usdcsol: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    usdcbsc: /^0x[a-fA-F0-9]{40}$/,
    usdc: /^0x[a-fA-F0-9]{40}$/
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNAS_PUBLICAS = [
    'id',
    'cuenta_id',
    'proveedor',
    'metodo',
    'monto_mxn',
    'moneda_destino',
    'estado',
    'provider_status',
    'destino_ultimos4',
    'red_crypto',
    'wallet_destino',
    'error_code',
    'error_message',
    'created_at',
    'processed_at',
    'completed_at',
    'updated_at'
].join(', ');

// ================================================================
// HELPERS DE VALIDACIÓN
// ================================================================

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

/**
 * CLABE interbancaria: 18 dígitos con dígito verificador.
 * Pesos 3, 7, 1 repetidos; control = (10 - (suma mod 10)) mod 10.
 */
function validarClabe(clabe) {
    if (typeof clabe !== 'string' || !/^\d{18}$/.test(clabe)) {
        return false;
    }

    const pesos = [3, 7, 1];
    let suma = 0;

    for (let i = 0; i < 17; i++) {
        suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
    }

    const digitoControl = (10 - (suma % 10)) % 10;
    return digitoControl === Number(clabe[17]);
}

function normalizarMonto(valor) {
    const n = Number(valor);

    if (!Number.isFinite(n)) {
        throw errors.errorMontoInvalido();
    }

    const redondeado = Math.round(n * 100) / 100;

    if (redondeado < MONTO_MINIMO_MXN) {
        throw new errors.ErrorValidacion(
            'MONTO_MINIMO',
            `El monto mínimo de retiro es $${MONTO_MINIMO_MXN} MXN`
        );
    }

    if (redondeado > MONTO_MAXIMO_MXN) {
        throw new errors.ErrorValidacion(
            'MONTO_MAXIMO',
            `El monto máximo de retiro es $${MONTO_MAXIMO_MXN} MXN`
        );
    }

    return redondeado;
}

function validarIdempotencyKey(key) {
    if (typeof key !== 'string') {
        throw errors.errorIdempotencyKeyFaltante();
    }

    const limpia = key.trim();

    if (limpia.length < 8 || limpia.length > 200) {
        throw errors.errorIdempotencyKeyFaltante();
    }

    return limpia;
}

/**
 * Valida el destino según el método y devuelve los datos ya normalizados
 * para guardar en pay_retiros. Lanza error si algo no cuadra.
 */
function validarDestino(params) {
    const p = params || {};

    if (p.metodo === 'spei') {
        if (!validarClabe(p.clabeDestino)) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'CLABE inválida (18 dígitos y dígito verificador)'
            });
        }

        const monedaSolicitada = p.monedaDestino ? String(p.monedaDestino).toUpperCase() : 'MXN';

        if (monedaSolicitada !== 'MXN') {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'SPEI solo acepta MXN'
            });
        }

        const nombre = typeof p.nombreTitular === 'string' ? p.nombreTitular.trim() : '';
        const rfc = typeof p.rfcTitular === 'string' ? p.rfcTitular.trim().toUpperCase() : '';

        if (nombre.length < 3) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Falta el nombre del titular de la cuenta'
            });
        }

        if (!/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'RFC del titular inválido'
            });
        }

        return {
            proveedor: 'fintoc',
            moneda_destino: 'MXN',
            red_crypto: null,
            wallet_destino: null,
            destino_ultimos4: p.clabeDestino.slice(-4),
            nombre_titular: nombre,
            rfc_titular: rfc
        };
    }

    if (p.metodo === 'crypto') {
        const moneda = String(p.monedaDestino || '').toUpperCase();

        if (!REDES_POR_MONEDA[moneda]) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: 'Moneda destino debe ser USDT o USDC'
            });
        }

        const red = String(p.redCrypto || '').toLowerCase();

        if (!REDES_POR_MONEDA[moneda].includes(red)) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: `Red ${red || '(vacía)'} no permitida para ${moneda}`,
                redes_validas: REDES_POR_MONEDA[moneda]
            });
        }

        const wallet = typeof p.walletDestino === 'string' ? p.walletDestino.trim() : '';

        if (!VALIDADOR_WALLET[red] || !VALIDADOR_WALLET[red].test(wallet)) {
            throw errors.errorDestinoRetiroInvalido({
                motivo: `La dirección no tiene formato válido para la red ${red}`
            });
        }

        return {
            proveedor: 'nowpayments',
            moneda_destino: moneda,
            red_crypto: red,
            wallet_destino: wallet,
            destino_ultimos4: wallet.slice(-4),
            nombre_titular: null,
            rfc_titular: null
        };
    }

    throw errors.errorMetodoInvalido(p.metodo);
}

// ================================================================
// HELPERS DE BASE DE DATOS
// ================================================================

async function verificarCuentaDelUsuario(usuarioId, cuentaId) {
    const { data, error } = await supabaseAdmin
        .from('pay_cuentas')
        .select('id, usuario_id, estado')
        .eq('id', cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Retiros/Service] Error verificando cuenta: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        throw errors.errorCuentaNoEncontrada({ cuenta_id: cuentaId });
    }

    if (data.usuario_id !== usuarioId) {
        throw errors.errorNoEsPropietario();
    }

    if (data.estado !== 'activa') {
        throw errors.errorCuentaNoActiva(data.estado);
    }

    return data;
}

async function obtenerRetiroPorId(retiroId) {
    const { data, error } = await supabaseAdmin
        .from('pay_retiros')
        .select('*')
        .eq('id', retiroId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Retiros/Service] Error leyendo retiro: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    return data || null;
}

/**
 * Traduce las excepciones de pay_reservar_retiro a errores tipados.
 */
function traducirErrorReserva(error, monto) {
    const msg = (error && error.message) || '';

    if (msg.includes('INSUFFICIENT_AVAILABLE_BALANCE')) {
        return errors.errorSaldoInsuficiente(null, monto);
    }

    if (msg.includes('PAY_ACCOUNT_NOT_FOUND')) {
        return errors.errorCuentaNoEncontrada();
    }

    if (msg.includes('INVALID_AMOUNT')) {
        return errors.errorMontoInvalido();
    }

    if (msg.includes('PARAMETRO_INVALIDO')) {
        return new errors.ErrorValidacion(
            'PARAMETRO_INVALIDO',
            'Método, moneda o proveedor no permitidos'
        );
    }

    if (msg.includes('PARAMETRO_REQUERIDO')) {
        return errors.errorParametroRequerido('método, moneda o proveedor');
    }

    logger.error(`[Pay Retiros/Service] Error en pay_reservar_retiro: ${msg}`);
    return new errors.ErrorInterno('ERROR_RESERVA_RETIRO', msg);
}

/**
 * Pasa el retiro de 'pending' a 'processing' con un UPDATE controlado.
 * Solo afecta la fila si sigue en 'pending', así que no pisa cambios
 * hechos por otro proceso (por ejemplo, un webhook que ya cerró el retiro).
 */
async function marcarEnProceso(retiro, resultado, metadataSolicitud) {
    const ahora = new Date().toISOString();

    const metadata = Object.assign(
        {},
        retiro.metadata || {},
        metadataSolicitud || {},
        resultado.metadata || {}
    );

    const { data, error } = await supabaseAdmin
        .from('pay_retiros')
        .update({
            estado: 'processing',
            provider_transfer_id: resultado.provider_transfer_id,
            provider_status: resultado.provider_status || null,
            provider_destination_id: resultado.provider_destination_id || null,
            metadata: metadata,
            processed_at: ahora,
            updated_at: ahora
        })
        .eq('id', retiro.id)
        .eq('estado', 'pending')
        .select('*');

    if (error) {
        logger.error(
            `[Pay Retiros/Service] Error pasando a processing ${retiro.id}: ${error.message}`
        );
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data || data.length === 0) {
        logger.warn(
            `[Pay Retiros/Service] Retiro ${retiro.id} ya no estaba en pending al marcar processing`
        );
        return obtenerRetiroPorId(retiro.id);
    }

    return data[0];
}

// ================================================================
// ENVÍO AL PROVEEDOR
// ================================================================

async function enviarAlProveedor(retiro, datosDestino) {
    if (retiro.metodo === 'spei') {
        return fintocPayout.crearPayout(retiro, {
            clabe: datosDestino.clabe,
            nombreTitular: datosDestino.nombre_titular,
            rfc: datosDestino.rfc_titular
        });
    }

    if (retiro.metodo === 'crypto') {
        return nowpaymentsPayout.crearPayout(retiro);
    }

    throw errors.errorMetodoInvalido(retiro.metodo);
}

// ================================================================
// CERRAR RETIRO (wrapper de pay_cerrar_retiro)
// ================================================================
// Exportado para que el webhook del proveedor lo use al recibir
// el resultado final del payout.
// ================================================================

async function cerrarRetiro(retiroId, estado, datos) {
    if (!ESTADOS_FINALES.includes(estado)) {
        throw new errors.ErrorValidacion('ESTADO_INVALIDO', `Estado final no válido: ${estado}`);
    }

    const d = datos || {};

    const { data, error } = await supabaseAdmin.rpc('pay_cerrar_retiro', {
        p_retiro_id: retiroId,
        p_estado: estado,
        p_provider_transfer_id: d.provider_transfer_id || null,
        p_provider_status: d.provider_status || null,
        p_error_code: d.error_code || null,
        p_error_message: d.error_message ? String(d.error_message).slice(0, 500) : null,
        p_metadata: d.metadata || {}
    });

    if (error) {
        logger.error(`[Pay Retiros/Service] Error en pay_cerrar_retiro ${retiroId}: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_CERRANDO_RETIRO', error.message);
    }

    logger.info(
        `[Pay Retiros/Service] Retiro ${retiroId} cerrado como ${estado} ` +
        `(already_processed=${data && data.already_processed})`
    );

    return data;
}

// ================================================================
// SOLICITAR RETIRO
// ================================================================

async function solicitarRetiro(params) {
    verificarSupabaseAdmin();

    const p = params || {};

    if (!p.usuarioId || !p.cuentaId) {
        throw errors.errorParametroRequerido('usuarioId o cuentaId');
    }

    const metodo = String(p.metodo || '').trim().toLowerCase();

    if (!METODOS_ACTIVOS.includes(metodo)) {
        throw new errors.ErrorValidacion(
            'METODO_NO_ACTIVO',
            `El método ${metodo || '(vacío)'} no está disponible en esta fase`
        );
    }

    const monto = normalizarMonto(p.montoMxn);
    const idempotencyKey = validarIdempotencyKey(p.idempotencyKey);

    await verificarCuentaDelUsuario(p.usuarioId, p.cuentaId);

    const destino = validarDestino({
        metodo: metodo,
        monedaDestino: p.monedaDestino,
        redCrypto: p.redCrypto,
        walletDestino: p.walletDestino,
        clabeDestino: p.clabeDestino,
        nombreTitular: p.nombreTitular,
        rfcTitular: p.rfcTitular
    });

    // ---------- 1) Reservar saldo (atómico e idempotente) ----------
    const { data: retiroId, error: errReserva } = await supabaseAdmin.rpc(
        'pay_reservar_retiro',
        {
            p_cuenta_id: p.cuentaId,
            p_monto_mxn: monto,
            p_idempotency_key: idempotencyKey,
            p_metodo: metodo,
            p_moneda_destino: destino.moneda_destino,
            p_proveedor: destino.proveedor,
            p_destino_ultimos4: destino.destino_ultimos4,
            p_red_crypto: destino.red_crypto,
            p_wallet_destino: destino.wallet_destino
        }
    );

    if (errReserva) {
        throw traducirErrorReserva(errReserva, monto);
    }

    const existente = await obtenerRetiroPorId(retiroId);

    if (!existente) {
        throw new errors.ErrorInterno('RETIRO_NO_LEIDO', 'No se pudo leer el retiro reservado');
    }

    // La RPC devuelve el retiro si la idempotency_key ya existía.
    // Esa llave es global, así que hay que confirmar que sea de esta
    // cuenta, con el mismo monto y método.
    if (existente.cuenta_id !== p.cuentaId) {
        logger.error(
            `[Pay Retiros/Service] idempotency_key reutilizada por otra cuenta (retiro ${retiroId})`
        );
        throw errors.errorRetiroNoEncontrado();
    }

    if (Number(existente.monto_mxn) !== monto || existente.metodo !== metodo) {
        throw new errors.ErrorConflicto(
            'IDEMPOTENCY_KEY_REUTILIZADA',
            'Esta solicitud ya existe con datos distintos'
        );
    }

    // Si ya avanzó (processing o final), no se vuelve a enviar nada.
    if (existente.estado !== 'pending') {
        return existente;
    }

    // ---------- 2) Enviar al proveedor (idempotente por retiro.id) ----------
    let resultado;

    try {
        resultado = await enviarAlProveedor(existente, {
            clabe: p.clabeDestino,
            nombre_titular: destino.nombre_titular,
            rfc_titular: destino.rfc_titular
        });
    } catch (errProveedor) {
        const esNuestro = errProveedor instanceof errors.ErrorCsarielsPay;

        if (esNuestro && errProveedor.reintentable === false) {
            // Rechazo permanente: se marca failed y se devuelve el saldo.
            logger.error(
                `[Pay Retiros/Service] Rechazo permanente en retiro ${retiroId}: ${errProveedor.message}`
            );

            await cerrarRetiro(retiroId, 'failed', {
                error_code: errProveedor.code,
                error_message: errProveedor.message
            });

            return obtenerRetiroPorId(retiroId);
        }

        // Error temporal: el retiro queda en pending con el saldo reservado.
        // Reintentar con la misma idempotencyKey es seguro.
        logger.warn(
            `[Pay Retiros/Service] Error temporal en retiro ${retiroId}: ${errProveedor.message}`
        );

        if (esNuestro) {
            throw errProveedor;
        }

        throw errors.errorProveedorErrorTemporal(existente.proveedor, {
            motivo: errProveedor && errProveedor.message ? errProveedor.message : 'error_desconocido'
        });
    }

    // ---------- 3) Marcar processing con UPDATE controlado ----------
    const metadataSolicitud = {
        solicitud: {
            pais: p.datosExtra && p.datosExtra.pais ? p.datosExtra.pais : 'MX',
            ip: p.datosExtra && p.datosExtra.ip ? p.datosExtra.ip : null,
            user_agent: p.datosExtra && p.datosExtra.user_agent ? p.datosExtra.user_agent : null
        }
    };

    const enProceso = await marcarEnProceso(existente, resultado, metadataSolicitud);

    // ---------- 4) Si el proveedor ya dio resultado final, cerrar ----------
    if (resultado.estado_inmediato === 'completed') {
        await cerrarRetiro(retiroId, 'completed', {
            provider_transfer_id: resultado.provider_transfer_id,
            provider_status: resultado.provider_status
        });
        return obtenerRetiroPorId(retiroId);
    }

    if (resultado.estado_inmediato === 'failed') {
        await cerrarRetiro(retiroId, 'failed', {
            provider_transfer_id: resultado.provider_transfer_id,
            provider_status: resultado.provider_status,
            error_code: 'PROVEEDOR_RECHAZO_INMEDIATO',
            error_message: 'El proveedor rechazó el payout al crearlo'
        });
        return obtenerRetiroPorId(retiroId);
    }

    logger.info(
        `[Pay Retiros/Service] Retiro ${retiroId} en processing ` +
        `(${existente.metodo}, $${monto} MXN, transfer ${resultado.provider_transfer_id})`
    );

    return enProceso;
}

// ================================================================
// LISTAR RETIROS
// ================================================================

async function listarRetiros(params) {
    verificarSupabaseAdmin();

    const p = params || {};

    const limite = Math.min(
        Math.max(parseInt(p.limite, 10) || LIMITE_POR_DEFECTO, 1),
        LIMITE_MAXIMO
    );
    const offset = Math.max(parseInt(p.offset, 10) || 0, 0);

    let query = supabaseAdmin
        .from('pay_retiros')
        .select(COLUMNAS_PUBLICAS, { count: 'exact' })
        .eq('cuenta_id', p.cuentaId);

    if (Array.isArray(p.estados) && p.estados.length > 0) {
        const validos = p.estados.filter(function (e) {
            return ESTADOS_VALIDOS.includes(e);
        });

        if (validos.length > 0) {
            query = query.in('estado', validos);
        }
    }

    const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limite - 1);

    if (error) {
        logger.error(`[Pay Retiros/Service] Error listando retiros: ${error.message}`);
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
// OBTENER RETIRO
// ================================================================

async function obtenerRetiro(params) {
    verificarSupabaseAdmin();

    const p = params || {};

    if (!p.retiroId || !UUID_REGEX.test(String(p.retiroId))) {
        throw errors.errorRetiroNoEncontrado();
    }

    const { data, error } = await supabaseAdmin
        .from('pay_retiros')
        .select(COLUMNAS_PUBLICAS)
        .eq('id', p.retiroId)
        .eq('cuenta_id', p.cuentaId)
        .maybeSingle();

    if (error) {
        logger.error(`[Pay Retiros/Service] Error obteniendo retiro: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!data) {
        throw errors.errorRetiroNoEncontrado();
    }

    return data;
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    solicitarRetiro: solicitarRetiro,
    listarRetiros: listarRetiros,
    obtenerRetiro: obtenerRetiro,
    cerrarRetiro: cerrarRetiro,

    validarClabe: validarClabe,
    ESTADOS_VALIDOS: ESTADOS_VALIDOS,
    ESTADOS_FINALES: ESTADOS_FINALES,
    METODOS_ACTIVOS: METODOS_ACTIVOS
};