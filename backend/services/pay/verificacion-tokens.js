// ================================================================
// SERVICES/PAY/VERIFICACION-TOKENS.JS
// CSARIEL'S PAY - TOKENS DE VERIFICACIÓN
// ================================================================
// Los tokens de verificación son "boletos de acceso" que el usuario
// obtiene después de pasar por:
//   1. Liveness (que sea persona real).
//   2. Biometría (huella o rostro).
//
// El retiro solo se puede crear si el usuario presenta un token válido.
//
// Características:
//   - Un solo uso.
//   - TTL de 5 minutos.
//   - Vinculado a usuario, monto y método.
//   - Firmado con HMAC (no falsificable).
//   - Auditoría completa.
//
// Flujo:
//   1. Usuario verifica identidad (huella o rostro).
//   2. Backend genera token vinculado a usuario+monto+método.
//   3. Usuario crea retiro presentando el token.
//   4. Backend valida el token y consume (marca como usado).
//   5. Retiro se crea.
//
// Si el token expira o se usa dos veces, el retiro se rechaza.
// ================================================================

'use strict';

const crypto = require('crypto');

const logger = require('../../utils/logger');
const errors = require('./errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const TOKEN_SECRET = process.env.BIOMETRIA_SECRET || process.env.VERIFICACION_TOKEN_SECRET;

// TTL del token: 5 minutos
const TOKEN_TTL_MS = 5 * 60 * 1000;

// Almacenamiento en memoria de tokens activos
// NOTA: si Railway reinicia, se pierden. Los usuarios deben repetir el proceso.
const tokensActivos = new Map(); // token -> { usuarioId, montoMaximo, metodo, metodoBiometrico, expiraEn, usado, creadoEn, metadata }

// ================================================================
// VERIFICAR CONFIGURACIÓN
// ================================================================

function verificarConfiguracion() {
    if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
        throw new errors.ErrorInterno(
            'TOKEN_SECRET_NO_CONFIGURADO',
            'El sistema de tokens no está configurado correctamente'
        );
    }
}

// ================================================================
// GENERAR TOKEN
// ================================================================
// Se llama desde `biometria.js` o `liveness.js` después de validar.
//
// Datos requeridos:
//   - usuarioId: uuid
//   - montoMaximo: número (monto máximo autorizado para retirar)
//   - metodo: 'spei' | 'crypto' | 'tarjeta'
//   - metodoBiometrico: 'huella' | 'rostro'
//   - livenessVerificado: boolean
//   - metadata: objeto opcional (scores, IP, dispositivo, etc.)
// ================================================================

function generarTokenVerificacion(datos) {
    verificarConfiguracion();

    const d = datos || {};

    if (!d.usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const montoMaximo = Number(d.montoMaximo);

    if (!Number.isFinite(montoMaximo) || montoMaximo <= 0) {
        throw errors.errorMontoInvalido();
    }

    const metodo = d.metodo;

    if (!metodo || !['spei', 'crypto', 'tarjeta'].includes(metodo)) {
        throw errors.errorMetodoInvalido(metodo);
    }

    const metodoBiometrico = d.metodoBiometrico;

    if (!metodoBiometrico || !['huella', 'rostro'].includes(metodoBiometrico)) {
        throw errors.errorParametroRequerido('metodoBiometrico (huella|rostro)');
    }

    // Generar token
    const tokenAleatorio = crypto.randomBytes(32).toString('base64url');
    const timestamp = Date.now();

    // Firma HMAC para que no se pueda falsificar
    const contenido = `${d.usuarioId}:${montoMaximo}:${metodo}:${metodoBiometrico}:${timestamp}:${tokenAleatorio}`;
    const firma = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(contenido)
        .digest('hex');

    const token = `${firma}.${tokenAleatorio}`;

    // Guardar en memoria
    tokensActivos.set(token, {
        usuarioId: d.usuarioId,
        montoMaximo: montoMaximo,
        metodo: metodo,
        metodoBiometrico: metodoBiometrico,
        livenessVerificado: d.livenessVerificado === true,
        expiraEn: timestamp + TOKEN_TTL_MS,
        usado: false,
        creadoEn: timestamp,
        metadata: d.metadata || {}
    });

    logger.info(
        `[VerifTokens] Token generado: usuario=${d.usuarioId} ` +
        `monto_max=${montoMaximo} metodo=${metodo} bio=${metodoBiometrico}`
    );

    return {
        token: token,
        expira_en_ms: TOKEN_TTL_MS,
        monto_maximo: montoMaximo,
        metodo: metodo,
        metodo_biometrico: metodoBiometrico
    };
}

// ================================================================
// VALIDAR TOKEN
// ================================================================
// Se llama desde `retiros.js` antes de crear un retiro.
//
// Parámetros:
//   - token: string
//   - usuarioId: uuid
//   - monto: número (monto del retiro)
//   - metodo: string (método del retiro)
//
// Si todo OK, marca el token como usado y devuelve { valido: true }.
// Si algo falla, tira un error tipado.
// ================================================================

async function validarYConsumirToken(datos) {
    verificarConfiguracion();

    const d = datos || {};

    if (!d.token || typeof d.token !== 'string') {
        throw new errors.ErrorAutorizacion(
            'TOKEN_REQUERIDO',
            'Se requiere verificación de identidad para este retiro'
        );
    }

    if (!d.usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const monto = Number(d.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
        throw errors.errorMontoInvalido();
    }

    if (!d.metodo) {
        throw errors.errorMetodoInvalido(d.metodo);
    }

    // Recuperar token de memoria
    const registro = tokensActivos.get(d.token);

    if (!registro) {
        throw new errors.ErrorAutorizacion(
            'TOKEN_NO_ENCONTRADO',
            'La verificación de identidad no es válida o expiró'
        );
    }

    // Verificar que pertenece al usuario
    if (registro.usuarioId !== d.usuarioId) {
        tokensActivos.delete(d.token);
        logger.warning(
            `[VerifTokens] Usuario ${d.usuarioId} intentó usar token de ${registro.usuarioId}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_NO_AUTORIZADO',
            'La verificación de identidad no corresponde a este usuario'
        );
    }

    // Verificar expiración
    if (registro.expiraEn < Date.now()) {
        tokensActivos.delete(d.token);
        throw new errors.ErrorAutorizacion(
            'TOKEN_EXPIRADO',
            'La verificación expiró. Verifica tu identidad de nuevo.'
        );
    }

    // Verificar que no esté usado
    if (registro.usado) {
        tokensActivos.delete(d.token);
        logger.warning(`[VerifTokens] Token ya usado por usuario ${d.usuarioId}`);
        throw new errors.ErrorAutorizacion(
            'TOKEN_YA_USADO',
            'Esta verificación ya fue utilizada. Genera una nueva.'
        );
    }

    // Verificar que el método coincida
    if (registro.metodo !== d.metodo) {
        logger.warning(
            `[VerifTokens] Método no coincide: ` +
            `token=${registro.metodo} solicitud=${d.metodo}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_METODO_NO_COINCIDE',
            `La verificación fue autorizada para ${registro.metodo}, no para ${d.metodo}`
        );
    }

    // Verificar que el monto no supere el autorizado
    if (monto > registro.montoMaximo) {
        logger.warning(
            `[VerifTokens] Monto supera el autorizado: ` +
            `autorizado=${registro.montoMaximo} solicitado=${monto}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_MONTO_EXCEDIDO',
            `Esta verificación autorizó hasta $${registro.montoMaximo} MXN. ` +
            `Verifica de nuevo para retirar $${monto} MXN.`
        );
    }

    // Verificar liveness previo
    if (!registro.livenessVerificado) {
        throw new errors.ErrorAutorizacion(
            'TOKEN_SIN_LIVENESS',
            'La verificación no incluye detección de liveness'
        );
    }

    // Verificar firma HMAC (por si alguien manipuló el token en memoria)
    const tokenPartes = d.token.split('.');

    if (tokenPartes.length !== 2) {
        tokensActivos.delete(d.token);
        throw new errors.ErrorAutorizacion(
            'TOKEN_FORMATO_INVALIDO',
            'El token de verificación es inválido'
        );
    }

    const [firmaRecibida, tokenAleatorio] = tokenPartes;

    const contenido = `${registro.usuarioId}:${registro.montoMaximo}:${registro.metodo}:${registro.metodoBiometrico}:${registro.creadoEn}:${tokenAleatorio}`;
    const firmaEsperada = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(contenido)
        .digest('hex');

    try {
        const bufEsperado = Buffer.from(firmaEsperada, 'hex');
        const bufRecibido = Buffer.from(firmaRecibida, 'hex');

        if (bufEsperado.length !== bufRecibido.length) {
            tokensActivos.delete(d.token);
            throw new errors.ErrorAutorizacion(
                'TOKEN_FIRMA_INVALIDA',
                'El token de verificación es inválido'
            );
        }

        const firmaValida = crypto.timingSafeEqual(bufEsperado, bufRecibido);

        if (!firmaValida) {
            tokensActivos.delete(d.token);
            logger.warning(`[VerifTokens] Firma inválida para usuario ${d.usuarioId}`);
            throw new errors.ErrorAutorizacion(
                'TOKEN_FIRMA_INVALIDA',
                'El token de verificación es inválido'
            );
        }
    } catch (err) {
        if (err && err.code === 'TOKEN_FIRMA_INVALIDA') {
            throw err;
        }
        tokensActivos.delete(d.token);
        logger.error(`[VerifTokens] Error validando firma: ${err.message}`);
        throw new errors.ErrorAutorizacion(
            'TOKEN_FIRMA_ERROR',
            'El token de verificación es inválido'
        );
    }

    // Marcar como usado
    registro.usado = true;

    logger.info(
        `[VerifTokens] Token validado y consumido: usuario=${d.usuarioId} ` +
        `monto=${monto} metodo=${d.metodo} bio=${registro.metodoBiometrico}`
    );

    return {
        valido: true,
        usuario_id: d.usuarioId,
        monto: monto,
        metodo: d.metodo,
        metodo_biometrico: registro.metodoBiometrico,
        metadata: registro.metadata
    };
}

// ================================================================
// CONSULTAR TOKEN (sin consumirlo)
// ================================================================
// Útil para que el frontend verifique si un token sigue válido
// antes de intentar usarlo.
// ================================================================

function consultarToken(token, usuarioId) {
    verificarConfiguracion();

    if (!token || typeof token !== 'string') {
        return { valido: false, motivo: 'token_ausente' };
    }

    const registro = tokensActivos.get(token);

    if (!registro) {
        return { valido: false, motivo: 'no_encontrado' };
    }

    if (registro.usuarioId !== usuarioId) {
        return { valido: false, motivo: 'no_es_propietario' };
    }

    if (registro.expiraEn < Date.now()) {
        return { valido: false, motivo: 'expirado' };
    }

    if (registro.usado) {
        return { valido: false, motivo: 'usado' };
    }

    return {
        valido: true,
        expira_en_ms: registro.expiraEn - Date.now(),
        monto_maximo: registro.montoMaximo,
        metodo: registro.metodo,
        metodo_biometrico: registro.metodoBiometrico
    };
}

// ================================================================
// INVALIDAR TOKEN
// ================================================================
// Útil si el usuario cancela el retiro antes de completarlo.
// ================================================================

function invalidarToken(token, usuarioId) {
    if (!token || typeof token !== 'string') return false;

    const registro = tokensActivos.get(token);

    if (!registro) return false;

    if (registro.usuarioId !== usuarioId) {
        logger.warning(`[VerifTokens] Usuario ${usuarioId} intentó invalidar token de otro`);
        return false;
    }

    tokensActivos.delete(token);
    logger.info(`[VerifTokens] Token invalidado por usuario ${usuarioId}`);

    return true;
}

// ================================================================
// INVALIDAR TODOS LOS TOKENS DE UN USUARIO
// ================================================================
// Útil si el usuario cambia contraseña, cierra sesión en todos
// los dispositivos, o hay actividad sospechosa.
// ================================================================

function invalidarTokensDeUsuario(usuarioId) {
    let contador = 0;

    for (const [token, registro] of tokensActivos.entries()) {
        if (registro.usuarioId === usuarioId) {
            tokensActivos.delete(token);
            contador++;
        }
    }

    if (contador > 0) {
        logger.info(`[VerifTokens] Invalidados ${contador} tokens de usuario ${usuarioId}`);
    }

    return contador;
}

// ================================================================
// ESTADÍSTICAS
// ================================================================
// Útil para monitoreo y debugging.
// ================================================================

function obtenerEstadisticas() {
    const ahora = Date.now();

    let activos = 0;
    let expirados = 0;
    let usados = 0;

    for (const registro of tokensActivos.values()) {
        if (registro.usado) {
            usados++;
        } else if (registro.expiraEn < ahora) {
            expirados++;
        } else {
            activos++;
        }
    }

    return {
        total: tokensActivos.size,
        activos: activos,
        expirados: expirados,
        usados: usados,
        ttl_ms: TOKEN_TTL_MS
    };
}

// ================================================================
// LIMPIEZA AUTOMÁTICA
// ================================================================
// Cada minuto, limpia tokens expirados o usados.
// ================================================================

setInterval(function () {
    const ahora = Date.now();
    let limpiados = 0;

    for (const [token, registro] of tokensActivos.entries()) {
        if (registro.usado || registro.expiraEn < ahora) {
            tokensActivos.delete(token);
            limpiados++;
        }
    }

    if (limpiados > 0) {
        logger.debug(`[VerifTokens] Limpiados ${limpiados} tokens expirados/usados`);
    }
}, 60 * 1000);

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    generarTokenVerificacion: generarTokenVerificacion,
    validarYConsumirToken: validarYConsumirToken,
    consultarToken: consultarToken,
    invalidarToken: invalidarToken,
    invalidarTokensDeUsuario: invalidarTokensDeUsuario,
    obtenerEstadisticas: obtenerEstadisticas,

    TOKEN_TTL_MS: TOKEN_TTL_MS
};