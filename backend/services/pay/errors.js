// ================================================================
// SERVICES/PAY/ERRORS.JS
// CSARIEL'S PAY - ERRORES TIPADOS DEL PAYMENT CORE
// ================================================================
// Todas las clases de error del módulo Pay viven aquí.
// Cada error tiene:
//   code          -> identificador corto y estable (para logs y para el frontend)
//   message       -> mensaje en español para mostrar al usuario
//   httpStatus    -> código HTTP sugerido para la respuesta
//   reintentable  -> si la operación debería reintentarse (webhooks, jobs)
//   detalles      -> objeto opcional con info adicional (nunca secretos)
//
// Uso típico:
//   const { ErrorPago, responderError } = require('./errors');
//   throw new ErrorPago('MONTO_INVALIDO', 'El monto debe ser mayor a 0', 400);
//
//   // En un router:
//   try {
//       ...
//   } catch (err) {
//       return responderError(res, err);
//   }
// ================================================================

'use strict';

// ================================================================
// CLASE BASE
// ================================================================

class ErrorCsarielsPay extends Error {
    /**
     * @param {string} code        - Identificador corto y estable
     * @param {string} message     - Mensaje en español para el usuario
     * @param {number} httpStatus  - Código HTTP sugerido
     * @param {object} options     - { reintentable, detalles, causaOriginal }
     */
    constructor(code, message, httpStatus, options) {
        super(message || code);

        const opts = options || {};

        this.name = 'ErrorCsarielsPay';
        this.code = code;
        this.httpStatus = Number.isInteger(httpStatus) ? httpStatus : 500;
        this.reintentable = opts.reintentable === true;
        this.detalles = opts.detalles || null;
        this.causaOriginal = opts.causaOriginal || null;

        // Mantener el stack de esta clase, no del caller
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ErrorCsarielsPay);
        }
    }

    /**
     * Serializa el error a un objeto seguro (sin stack, sin datos sensibles).
     * Se usa para responder al frontend y para logs estructurados.
     */
    toJSON() {
        const obj = {
            code: this.code,
            error: this.message,
            reintentable: this.reintentable
        };

        if (this.detalles && typeof this.detalles === 'object') {
            obj.detalles = this.detalles;
        }

        return obj;
    }
}

// ================================================================
// ERRORES DE VALIDACIÓN (400)
// ================================================================

class ErrorValidacion extends ErrorCsarielsPay {
    constructor(code, message, detalles) {
        super(code || 'DATOS_INVALIDOS', message || 'Datos inválidos', 400, {
            reintentable: false,
            detalles: detalles
        });
        this.name = 'ErrorValidacion';
    }
}

// ================================================================
// ERRORES DE AUTORIZACIÓN (403)
// ================================================================

class ErrorAutorizacion extends ErrorCsarielsPay {
    constructor(code, message, detalles) {
        super(code || 'NO_AUTORIZADO', message || 'No autorizado', 403, {
            reintentable: false,
            detalles: detalles
        });
        this.name = 'ErrorAutorizacion';
    }
}

// ================================================================
// ERRORES DE NO ENCONTRADO (404)
// ================================================================

class ErrorNoEncontrado extends ErrorCsarielsPay {
    constructor(code, message, detalles) {
        super(code || 'NO_ENCONTRADO', message || 'Recurso no encontrado', 404, {
            reintentable: false,
            detalles: detalles
        });
        this.name = 'ErrorNoEncontrado';
    }
}

// ================================================================
// ERRORES DE CONFLICTO (409)
// ================================================================

class ErrorConflicto extends ErrorCsarielsPay {
    constructor(code, message, detalles) {
        super(code || 'CONFLICTO', message || 'Conflicto con el estado actual', 409, {
            reintentable: false,
            detalles: detalles
        });
        this.name = 'ErrorConflicto';
    }
}

// ================================================================
// ERRORES DE PROVEEDOR (502/503)
// ================================================================

class ErrorProveedor extends ErrorCsarielsPay {
    constructor(code, message, detalles, reintentable) {
        super(code || 'ERROR_PROVEEDOR', message || 'Error del proveedor de pago', 502, {
            reintentable: reintentable === true,
            detalles: detalles
        });
        this.name = 'ErrorProveedor';
    }
}

// ================================================================
// ERRORES INTERNOS (500)
// ================================================================

class ErrorInterno extends ErrorCsarielsPay {
    constructor(code, message, detalles) {
        super(code || 'ERROR_INTERNO', message || 'Error interno del servidor', 500, {
            reintentable: true,
            detalles: detalles
        });
        this.name = 'ErrorInterno';
    }
}

// ================================================================
// FÁBRICAS DE ERRORES ESPECÍFICOS
// ================================================================
// Cada función devuelve una instancia ya lista para lanzar.
// Se usan en el Core y en los adapters para no escribir strings a mano.
// ================================================================

// ---------- Validación de entrada ----------

function errorMontoInvalido(detalles) {
    return new ErrorValidacion(
        'MONTO_INVALIDO',
        'El monto debe ser un número mayor a 0',
        detalles
    );
}

function errorMonedaInvalida(moneda) {
    return new ErrorValidacion(
        'MONEDA_INVALIDA',
        `Moneda no soportada: ${moneda}`,
        { moneda: moneda }
    );
}

function errorMetodoInvalido(metodo) {
    return new ErrorValidacion(
        'METODO_INVALIDO',
        `Método de pago no soportado: ${metodo}`,
        { metodo: metodo }
    );
}

function errorPaisNoSoportado(pais) {
    return new ErrorValidacion(
        'PAIS_NO_SOPORTADO',
        `El país ${pais} no está disponible en Csariel's Pay`,
        { pais: pais }
    );
}

function errorMetodoNoDisponibleEnPais(metodo, pais) {
    return new ErrorValidacion(
        'METODO_NO_DISPONIBLE_EN_PAIS',
        `El método "${metodo}" no está disponible en ${pais}`,
        { metodo: metodo, pais: pais }
    );
}

function errorIdempotencyKeyFaltante() {
    return new ErrorValidacion(
        'IDEMPOTENCY_KEY_FALTANTE',
        'Falta la clave de idempotencia',
        null
    );
}

function errorParametroRequerido(nombre) {
    return new ErrorValidacion(
        'PARAMETRO_REQUERIDO',
        `Falta el parámetro requerido: ${nombre}`,
        { parametro: nombre }
    );
}

// ---------- Cuenta / Propietario ----------

function errorCuentaNoEncontrada(detalles) {
    return new ErrorNoEncontrado(
        'CUENTA_NO_ENCONTRADA',
        'No se encontró la cuenta de Csariel\'s Pay',
        detalles
    );
}

function errorCuentaNoActiva(estado) {
    return new ErrorConflicto(
        'CUENTA_NO_ACTIVA',
        'La cuenta de Csariel\'s Pay no está activa',
        { estado: estado }
    );
}

function errorNoEsPropietario() {
    return new ErrorAutorizacion(
        'NO_ES_PROPIETARIO',
        'No tienes acceso a este recurso'
    );
}

// ---------- Intenciones ----------

function errorIntencionNoEncontrada(detalles) {
    return new ErrorNoEncontrado(
        'INTENCION_NO_ENCONTRADA',
        'No se encontró la intención de pago',
        detalles
    );
}

function errorIntencionYaPagada() {
    return new ErrorConflicto(
        'INTENCION_YA_PAGADA',
        'Esta intención ya fue pagada'
    );
}

function errorIntencionExpirada() {
    return new ErrorConflicto(
        'INTENCION_EXPIRADA',
        'Esta intención de pago ha expirado'
    );
}

function errorIntencionCancelada() {
    return new ErrorConflicto(
        'INTENCION_CANCELADA',
        'Esta intención de pago fue cancelada'
    );
}

function errorIntencionEstadoInvalido(estadoActual) {
    return new ErrorConflicto(
        'INTENCION_ESTADO_INVALIDO',
        `La intención no está en un estado válido para esta operación`,
        { estado_actual: estadoActual }
    );
}

// ---------- Retiros ----------

function errorSaldoInsuficiente(disponible, solicitado) {
    return new ErrorConflicto(
        'SALDO_INSUFICIENTE',
        'No tienes saldo suficiente para este retiro',
        {
            disponible_mxn: Number(disponible) || 0,
            solicitado_mxn: Number(solicitado) || 0
        }
    );
}

function errorRetiroNoEncontrado(detalles) {
    return new ErrorNoEncontrado(
        'RETIRO_NO_ENCONTRADO',
        'No se encontró la solicitud de retiro',
        detalles
    );
}

function errorRetiroYaProcesado(estadoActual) {
    return new ErrorConflicto(
        'RETIRO_YA_PROCESADO',
        'Este retiro ya fue procesado',
        { estado_actual: estadoActual }
    );
}

function errorDestinoRetiroInvalido(detalles) {
    return new ErrorValidacion(
        'DESTINO_RETIRO_INVALIDO',
        'Los datos de destino del retiro son inválidos',
        detalles
    );
}

// ---------- Webhooks ----------

function errorFirmaInvalida(proveedor) {
    return new ErrorAutorizacion(
        'FIRMA_INVALIDA',
        `Firma de webhook inválida (${proveedor})`,
        { proveedor: proveedor }
    );
}

function errorWebhookPayloadInvalido(proveedor, motivo) {
    return new ErrorValidacion(
        'WEBHOOK_PAYLOAD_INVALIDO',
        `Payload de webhook inválido (${proveedor})`,
        { proveedor: proveedor, motivo: motivo }
    );
}

// ---------- Proveedores externos ----------

function errorProveedorNoConfigurado(proveedor) {
    return new ErrorProveedor(
        'PROVEEDOR_NO_CONFIGURADO',
        `El proveedor ${proveedor} no está configurado`,
        { proveedor: proveedor },
        false
    );
}

function errorProveedorRechazo(proveedor, motivo, detalles) {
    return new ErrorProveedor(
        'PROVEEDOR_RECHAZO',
        `El proveedor ${proveedor} rechazó la operación: ${motivo}`,
        Object.assign({ proveedor: proveedor }, detalles || {}),
        false
    );
}

function errorProveedorTimeout(proveedor) {
    return new ErrorProveedor(
        'PROVEEDOR_TIMEOUT',
        `El proveedor ${proveedor} no respondió a tiempo`,
        { proveedor: proveedor },
        true
    );
}

function errorProveedorErrorTemporal(proveedor, detalles) {
    return new ErrorProveedor(
        'PROVEEDOR_ERROR_TEMPORAL',
        `El proveedor ${proveedor} devolvió un error temporal`,
        Object.assign({ proveedor: proveedor }, detalles || {}),
        true
    );
}

// ================================================================
// HELPER PARA RESPONDER EN ROUTERS
// ================================================================
// Convierte cualquier error (tipado o no) en la respuesta JSON
// estandarizada del proyecto: { success: false, error: '...' }
//
// Nunca expone stack ni detalles sensibles en producción.
// ================================================================

const ES_PRODUCCION =
    process.env.NODE_ENV === 'production';

function responderError(res, err) {
    // Si ya se envió la respuesta, no hacer nada
    if (res.headersSent) {
        return;
    }

    // Errores tipados del módulo Pay
    if (err instanceof ErrorCsarielsPay) {
        const payload = {
            success: false,
            error: err.message
        };

        // En desarrollo, agregar detalles técnicos
        if (!ES_PRODUCCION) {
            payload.code = err.code;
            if (err.detalles) {
                payload.detalles = err.detalles;
            }
        } else {
            // En producción, solo el código (útil para soporte)
            payload.code = err.code;
        }

        return res.status(err.httpStatus).json(payload);
    }

    // Errores de Supabase (tienen .code y .message pero no son nuestros)
    if (err && typeof err === 'object' && err.code && err.message && !err.httpStatus) {
        const payload = {
            success: false,
            error: 'Error en la base de datos'
        };

        if (!ES_PRODUCCION) {
            payload.code = err.code;
            payload.detalle = err.message;
        }

        return res.status(500).json(payload);
    }

    // Error nativo de JavaScript
    if (err instanceof Error) {
        const payload = {
            success: false,
            error: 'Error interno del servidor'
        };

        if (!ES_PRODUCCION) {
            payload.detalle = err.message;
            payload.stack = err.stack;
        }

        return res.status(500).json(payload);
    }

    // Algo raro (string, undefined, null)
    return res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
}

// ================================================================
// HELPER PARA WEBHOOKS
// ================================================================
// Decide si un error debe responderse con 500 (para que el
// proveedor reintente) o con 200 (para que deje de reintentar).
//
// Regla:
//   - Error tipado con reintentable === true  -> 500 (reintenta)
//   - Error tipado con reintentable === false -> 200 (no reintenta)
//   - Error desconocido                       -> 500 (reintenta)
// ================================================================

function esErrorReintentable(err) {
    if (err instanceof ErrorCsarielsPay) {
        return err.reintentable === true;
    }

    // Error desconocido -> por seguridad, reintentable
    return true;
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    // Clases base
    ErrorCsarielsPay: ErrorCsarielsPay,
    ErrorValidacion: ErrorValidacion,
    ErrorAutorizacion: ErrorAutorizacion,
    ErrorNoEncontrado: ErrorNoEncontrado,
    ErrorConflicto: ErrorConflicto,
    ErrorProveedor: ErrorProveedor,
    ErrorInterno: ErrorInterno,

    // Fábricas - Validación
    errorMontoInvalido: errorMontoInvalido,
    errorMonedaInvalida: errorMonedaInvalida,
    errorMetodoInvalido: errorMetodoInvalido,
    errorPaisNoSoportado: errorPaisNoSoportado,
    errorMetodoNoDisponibleEnPais: errorMetodoNoDisponibleEnPais,
    errorIdempotencyKeyFaltante: errorIdempotencyKeyFaltante,
    errorParametroRequerido: errorParametroRequerido,

    // Fábricas - Cuenta
    errorCuentaNoEncontrada: errorCuentaNoEncontrada,
    errorCuentaNoActiva: errorCuentaNoActiva,
    errorNoEsPropietario: errorNoEsPropietario,

    // Fábricas - Intenciones
    errorIntencionNoEncontrada: errorIntencionNoEncontrada,
    errorIntencionYaPagada: errorIntencionYaPagada,
    errorIntencionExpirada: errorIntencionExpirada,
    errorIntencionCancelada: errorIntencionCancelada,
    errorIntencionEstadoInvalido: errorIntencionEstadoInvalido,

    // Fábricas - Retiros
    errorSaldoInsuficiente: errorSaldoInsuficiente,
    errorRetiroNoEncontrado: errorRetiroNoEncontrado,
    errorRetiroYaProcesado: errorRetiroYaProcesado,
    errorDestinoRetiroInvalido: errorDestinoRetiroInvalido,

    // Fábricas - Webhooks
    errorFirmaInvalida: errorFirmaInvalida,
    errorWebhookPayloadInvalido: errorWebhookPayloadInvalido,

    // Fábricas - Proveedores
    errorProveedorNoConfigurado: errorProveedorNoConfigurado,
    errorProveedorRechazo: errorProveedorRechazo,
    errorProveedorTimeout: errorProveedorTimeout,
    errorProveedorErrorTemporal: errorProveedorErrorTemporal,

    // Helpers
    responderError: responderError,
    esErrorReintentable: esErrorReintentable
};