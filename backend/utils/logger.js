// ================================================================
// SISTEMA DE LOGS
// ================================================================

const fs = require('fs');
const path = require('path');

// Crear carpeta de logs si no existe
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

function log(mensaje, tipo = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${tipo}] ${mensaje}\n`;
    
    // Mostrar en consola
    console.log(logLine.trim());
    
    // Guardar en archivo solo en producción
    if (process.env.NODE_ENV === 'production') {
        const fecha = new Date().toISOString().split('T')[0];
        const logFile = path.join(logsDir, `${fecha}.log`);
        fs.appendFileSync(logFile, logLine);
    }
}

function info(mensaje) {
    log(mensaje, 'INFO');
}

function error(mensaje) {
    log(mensaje, 'ERROR');
}

function warning(mensaje) {
    log(mensaje, 'WARNING');
}

function debug(mensaje) {
    if (process.env.NODE_ENV === 'development') {
        log(mensaje, 'DEBUG');
    }
}

module.exports = {
    log,
    info,
    error,
    warning,
    debug
};