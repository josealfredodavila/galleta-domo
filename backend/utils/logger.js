// ================================================================
// UTILS/LOGGER.JS
// SISTEMA DE LOGS - SARIEL'S BACKEND
// ================================================================

// Railway captura automáticamente stdout/stderr.
// Por eso los logs principales se escriben en consola.

// ================================================================
// NORMALIZAR MENSAJE
// ================================================================

function normalizarMensaje(mensaje) {
    if (mensaje instanceof Error) {
        return mensaje.stack || mensaje.message;
    }

    if (typeof mensaje === 'object') {
        try {
            return JSON.stringify(mensaje);
        } catch {
            return String(mensaje);
        }
    }

    return String(mensaje);
}

// ================================================================
// LOG GENERAL
// ================================================================

function log(mensaje, tipo = 'INFO') {
    const timestamp = new Date().toISOString();
    const texto = normalizarMensaje(mensaje);

    const linea =
        `[${timestamp}] [${tipo}] ${texto}`;

    console.log(linea);
}

// ================================================================
// INFO
// ================================================================

function info(mensaje) {
    log(mensaje, 'INFO');
}

// ================================================================
// ERROR
// ================================================================

function error(mensaje) {
    log(mensaje, 'ERROR');
}

// ================================================================
// WARNING
// ================================================================

function warning(mensaje) {
    log(mensaje, 'WARNING');
}

// Alias adicional por compatibilidad
function warn(mensaje) {
    log(mensaje, 'WARNING');
}

// ================================================================
// DEBUG
// ================================================================

function debug(mensaje) {

    if (
        process.env.NODE_ENV === 'development' ||
        process.env.LOG_LEVEL === 'debug'
    ) {
        log(mensaje, 'DEBUG');
    }
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    log,
    info,
    error,
    warning,
    warn,
    debug
};