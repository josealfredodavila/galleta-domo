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
//   - Hacer payouts (eso lo hará retiros.js cuando lo escribamos)
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
    // 24 bytes -> 32 caracteres base64url (URL-safe)
    return crypto.randomBytes(24).toString('base64url');
}

function normalizarMonto(monto) {
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }
    // Redondear a 2 decimales (precisión de numeric en Postgres)
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
// Crea la cuenta Pay de un usuario si no existe. Idempotente.
// Se llama desde:
//   - routes/mercado.js cuando se crea una tienda
//   - routes/mercado-repartidor.js cuando se crea un repartidor
//   - Cualquier lugar que necesite asegurar la cuenta.
//
// Args:
//   usuarioId:      uuid del usuario
//   opciones:
//     tipo:         'vendedor' | 'repartidor'
//     tiendaId:     bigint (solo si tipo = 'vendedor')
//     repartidorId: bigint (solo si tipo = 'repartidor')
//
// Devuelve: la fila de pay_cuentas (existente o nueva).
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

    // 1) Buscar si ya existe por el identificador natural
    //    (tienda_id o repartidor_id, según tipo)
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
        throw errors.errorInterno ? errors.errorInterno('ERROR_DB', errBuscar.message) : errBuscar;
    }

    if (existente) {
        return existente;
    }

    // 2) Crear la cuenta
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
        // Si falló por UNIQUE constraint (race condition con otro request),
        // reintentamos la búsqueda una vez.
        if (errInsert.code === '23505') {
            const { data: reintento } = await query.maybeSingle();
            if (reintento) {
                return reintento;
            }
        }

        logger.error(`[Pay Core] Error creando cuenta: ${errInsert.message}`);
        throw new errors.ErrorInterno('ERROR_CREANDO_CUENTA', errInsert.message);
    }

    // 3) Crear la fila de saldos (0 / 0) si no existe
    const { error: errSaldo } = await supabaseAdmin
        .from('pay_saldos')
        .insert({
            cuenta_id: creada.id,
            disponible_mxn: 0,
            pendiente_mxn: 0
        });

    if (errSaldo && errSaldo.code !== '23505') {
        // 23505 = unique_violation: otro proceso lo creó. OK.
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
        // Devolver ceros si aún no existe la fila
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
// Crea una intención en pay_intenciones y devuelve la fila.
//
// Args:
//   datos:
//     cuentaReceptoraId -> uuid de pay_cuentas del vendedor/repartidor
//     compradorId       -> uuid del usuario comprador (nullable)
//     monto             -> número
//     metodo            -> 'tarjeta' | 'spei' | 'usdt' | 'usdc'
//     codigoPais        -> 'MX' | 'CO' | ...
//     moneda            -> opcional. Si no, se deriva del método.
//     pedidoId          -> opcional. bigint.
//     descripcion       -> opcional. string.
//     idempotencyKey    -> string único del cliente.
//     datosExtra        -> opcional. Objeto que se guarda en metadata.
//
// Devuelve: la fila creada de pay_intenciones.
// ================================================================

async function crearIntencion(datos) {
    verificarSupabaseAdmin();

    const d = datos || {};

    // ---------- Validaciones básicas ----------
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

    // ---------- Verificar cuenta receptora ----------
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

    // ---------- Idempotencia: verificar si ya existe ----------
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
        // Verificar que coincida con la petición actual
        // (mismo monto, misma cuenta, mismo método)
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

    // ---------- Crear la intención ----------
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
        // Si falló por UNIQUE (race condition con otro request que
        // usó la misma idempotency_key), devolvemos la que ya existe.
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
// Se usa en la página pública del QR. Devuelve SOLO datos no
// sensibles. NUNCA expone cuenta_receptora_id, comprador_id, ni
// datos de proveedor.
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

    // Verificar expiración en runtime (aunque el cron la marque)
    const expiradaPorTiempo =
        data.expires_at &&
        new Date(data.expires_at) < new Date() &&
        data.estado === 'pending';

    const pais = (data.metadata && data.metadata.pais) || paises.PAIS_POR_DEFECTO;

    // Respuesta pública sanitizada
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
        // El comprador elige el método en la página pública si aún no hay uno fijo.
        metodo_pago_actual: data.metodo_pago,
        creada_en: data.created_at
    };
}

// ================================================================
// PROCESAR WEBHOOK
// ================================================================
// Punto de entrada único para todos los webhooks de proveedor.
//
// Args:
//   proveedor -> 'stripe' | 'fintoc' | 'nowpayments'
//   req       -> request completo (body, rawBody, headers)
//
// Devuelve: { status, ...datos }
//   status = 'ok'         -> procesado correctamente
//   status = 'duplicado'  -> evento ya procesado (idempotente)
//   status = 'ignorado'   -> evento no relevante para nuestro flujo
//   status = 'error'      -> error; reintentable si err.reintentable
//
// El router decide el HTTP status basándose en estos valores.
// ================================================================

async function procesarWebhook(proveedor, req) {
    verificarSupabaseAdmin();

    if (!proveedor || !paises.PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
        throw errors.errorWebhookPayloadInvalido(proveedor, 'proveedor desconocido');
    }

    // Cargar el adapter correspondiente
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

    // El adapter hace todo el trabajo específico del proveedor.
    // Devuelve un objeto con esta forma:
    //   {
    //     firma_valida: boolean,
    //     event_id: string,
    //     tipo_evento: string,
    //     accion: 'confirmar_intencion' | 'cerrar_retiro' | 'ignorar',
    //     intencion_id: uuid (si accion = confirmar_intencion),
    //     retiro_id: uuid (si accion = cerrar_retiro),
    //     provider_transaction_id: string,
    //     provider_status: string,
    //     provider_fee_mxn: number,
    //     network_fee_mxn: number,
    //     metadata: object
    //   }
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

    // Si el evento ya existe Y ya fue procesado, devolvemos duplicado.
    if (registro && registro.insertado === false && registro.duplicado === true && registro.procesado === true) {
        logger.info(`[Pay Core] Webhook duplicado ignorado: ${proveedor}/${resultado.event_id}`);
        return {
            status: 'duplicado',
            event_id: resultado.event_id,
            proveedor: proveedor
        };
    }

    // A partir de aquí, sabemos que es un evento nuevo o uno que
    // quedó sin procesar. Vamos a procesarlo.

    // ---------- 3) Ejecutar la acción ----------
    let accionEjecutada = 'ninguna';

    try {
        if (resultado.accion === 'confirmar_intencion' && resultado.intencion_id) {
            // Verificar que la intención exista y no esté ya pagada
            const { data: intencion, error: errInt } = await supabaseAdmin
                .from('pay_intenciones')
                .select('id, estado, proveedor')
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
            logger.info(
                `[Pay Core] Intención confirmada: ${resultado.intencion_id} ` +
                `(${proveedor}/${resultado.provider_transaction_id || 'sin_tx_id'})`
            );

        } else if (resultado.accion === 'cerrar_retiro' && resultado.retiro_id) {
            // Se procesará cuando escribamos retiros.js. Por ahora
            // solo marcamos como procesado y dejamos log.
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
            retiro_id: resultado.retiro_id || null
        };

    } catch (errProceso) {
        // Marcar el error en el evento para auditoría
        await marcarWebhookProcesado(
            proveedor,
            resultado.event_id,
            errProceso.message || 'error desconocido',
            false
        );

        // Re-lanzar para que el router decida HTTP status
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
    // Cuentas
    asegurarCuentaPay: asegurarCuentaPay,
    obtenerCuentaPayDeUsuario: obtenerCuentaPayDeUsuario,
    obtenerSaldos: obtenerSaldos,

    // Métodos
    listarMetodosDisponibles: listarMetodosDisponibles,

    // Intenciones
    crearIntencion: crearIntencion,
    obtenerIntencionPorTokenPublico: obtenerIntencionPorTokenPublico,

    // Webhooks
    procesarWebhook: procesarWebhook,

    // Constantes por si las necesita algún router
    MONEDA_POR_METODO: MONEDA_POR_METODO,
    EXPIRACION_INTENCION_MS: EXPIRACION_INTENCION_MS
};