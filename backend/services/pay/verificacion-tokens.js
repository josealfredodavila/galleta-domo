// ================================================================
// SERVICES/PAY/VERIFICACION-TOKENS.JS
// CSARIEL'S PAY - TOKENS DE VERIFICACIÓN
// ================================================================
// Los tokens son "boletos de acceso" de un solo uso que el usuario
// obtiene después de verificar su identidad:
//   - Huella (WebAuthn): validada por el dispositivo. NO requiere liveness.
//   - Rostro: requiere liveness reciente (y, cuando esté integrado,
//     la validación del proveedor Incode).
//
// Características:
//   - Un solo uso.
//   - TTL de 5 minutos.
//   - Vinculado a usuario, monto máximo, método y tipo biométrico.
//   - Firmado con HMAC (no falsificable).
//   - Auditoría en logs.
//
// NOTA DE ALCANCE:
//   Los tokens se guardan en memoria del proceso. Si Railway reinicia
//   o escala a más de una instancia, los tokens activos se pierden o
//   no se encuentran. El usuario debe repetir la verificación. Esto es
//   aceptable para la fase actual; la migración a pay_tokens_verificacion
//   (tabla existente) queda pendiente de decisión.
// ================================================================

'use strict';

const crypto = require('crypto');

const logger = require('../../utils/logger');
const errors = require('./errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const TOKEN_SECRET =
    process.env.BIOMETRIA_SECRET ||
    process.env.VERIFICACION_TOKEN_SECRET;

// TTL del token: 5 minutos
const TOKEN_TTL_MS = 5 * 60 * 1000;

const METODOS_VALIDOS = ['spei', 'crypto'];
const BIOMETRICOS_VALIDOS = ['huella', 'rostro'];

// Almacenamiento en memoria de tokens activos.
// token -> { usuarioId, montoMaximo, metodo, metodoBiometrico,
//            livenessVerificado, expiraEn, usado, creadoEn, metadata }
const tokensActivos = new Map();

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
// REGLA DE LIVENESS
// ================================================================
// Solo el método facial exige liveness. La huella se valida con la
// firma criptográfica del dispositivo (WebAuthn).
// ================================================================

function requiereLiveness(metodoBiometrico) {
    return metodoBiometrico === 'rostro';
}

// ================================================================
// GENERAR TOKEN
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

    const metodo = String(d.metodo || '').toLowerCase();

    if (!METODOS_VALIDOS.includes(metodo)) {
        throw errors.errorMetodoInvalido(d.metodo);
    }

    const metodoBiometrico = d.metodoBiometrico;

    if (!BIOMETRICOS_VALIDOS.includes(metodoBiometrico)) {
        throw errors.errorParametroRequerido('metodoBiometrico (huella|rostro)');
    }

    const livenessVerificado = d.livenessVerificado === true;

    // Un token facial sin liveness no se emite.
    if (requiereLiveness(metodoBiometrico) && !livenessVerificado) {
        throw new errors.ErrorAutorizacion(
            'TOKEN_SIN_LIVENESS',
            'La verificación facial requiere detección de liveness'
        );
    }

    const tokenAleatorio = crypto.randomBytes(32).toString('base64url');
    const timestamp = Date.now();

    const contenido =
        `${d.usuarioId}:${montoMaximo}:${metodo}:${metodoBiometrico}:` +
        `${livenessVerificado}:${timestamp}:${tokenAleatorio}`;

    const firma = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(contenido)
        .digest('hex');

    const token = `${firma}.${tokenAleatorio}`;

    tokensActivos.set(token, {
        usuarioId: d.usuarioId,
        montoMaximo: montoMaximo,
        metodo: metodo,
        metodoBiometrico: metodoBiometrico,
        livenessVerificado: livenessVerificado,
        expiraEn: timestamp + TOKEN_TTL_MS,
        usado: false,
        creadoEn: timestamp,
        metadata: d.metadata || {}
    });

    logger.info(
        `[VerifTokens] Token generado: usuario=${d.usuarioId} ` +
        `monto_max=${montoMaximo} metodo=${metodo} bio=${metodoBiometrico} ` +
        `liveness=${livenessVerificado}`
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
// VALIDAR Y CONSUMIR TOKEN
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

    const metodo = String(d.metodo || '').toLowerCase();

    if (!METODOS_VALIDOS.includes(metodo)) {
        throw errors.errorMetodoInvalido(d.metodo);
    }

    const registro = tokensActivos.get(d.token);

    if (!registro) {
        throw new errors.ErrorAutorizacion(
            'TOKEN_NO_ENCONTRADO',
            'La verificación de identidad no es válida o expiró'
        );
    }

    if (registro.usuarioId !== d.usuarioId) {
        tokensActivos.delete(d.token);
        logger.warn(
            `[VerifTokens] Usuario ${d.usuarioId} intentó usar token de ${registro.usuarioId}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_NO_AUTORIZADO',
            'La verificación de identidad no corresponde a este usuario'
        );
    }

    if (registro.expiraEn < Date.now()) {
        tokensActivos.delete(d.token);
        throw new errors.ErrorAutorizacion(
            'TOKEN_EXPIRADO',
            'La verificación expiró. Verifica tu identidad de nuevo.'
        );
    }

    if (registro.usado) {
        tokensActivos.delete(d.token);
        logger.warn(`[VerifTokens] Token ya usado por usuario ${d.usuarioId}`);
        throw new errors.ErrorAutorizacion(
            'TOKEN_YA_USADO',
            'Esta verificación ya fue utilizada. Genera una nueva.'
        );
    }

    if (registro.metodo !== metodo) {
        logger.warn(
            `[VerifTokens] Método no coincide: token=${registro.metodo} solicitud=${metodo}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_METODO_NO_COINCIDE',
            `La verificación fue autorizada para ${registro.metodo}, no para ${metodo}`
        );
    }

    if (monto > registro.montoMaximo) {
        logger.warn(
            `[VerifTokens] Monto supera el autorizado: ` +
            `autorizado=${registro.montoMaximo} solicitado=${monto}`
        );
        throw new errors.ErrorAutorizacion(
            'TOKEN_MONTO_EXCEDIDO',
            `Esta verificación autorizó hasta $${registro.montoMaximo} MXN. ` +
            `Verifica de nuevo para retirar $${monto} MXN.`
        );
    }

    // Liveness: solo para rostro.
    if (requiereLiveness(registro.metodoBiometrico) && !registro.livenessVerificado) {
        tokensActivos.delete(d.token);
        throw new errors.ErrorAutorizacion(
            'TOKEN_SIN_LIVENESS',
            'La verificación facial no incluye detección de liveness'
        );
    }

    const partes = d.token.split('.');

    if (partes.length !== 2) {
        tokensActivos.delete(d.token);
        throw new errors.ErrorAutorizacion(
            'TOKEN_FORMATO_INVALIDO',
            'El token de verificación es inválido'
        );
    }

    const [firmaRecibida, tokenAleatorio] = partes;

    const contenido =
        `${registro.usuarioId}:${registro.montoMaximo}:${registro.metodo}:` +
        `${registro.metodoBiometrico}:${registro.livenessVerificado}:` +
        `${registro.creadoEn}:${tokenAleatorio}`;

    const firmaEsperada = crypto
        .createHmac('sha256', TOKEN_SECRET)
        .update(contenido)
        .digest('hex');

    const bufEsperado = Buffer.from(firmaEsperada, 'hex');
    const bufRecibido = Buffer.from(firmaRecibida, 'hex');

    const firmaValida =
        bufEsperado.length === bufRecibido.length &&
        crypto.timingSafeEqual(bufEsperado, bufRecibido);

    if (!firmaValida) {
        tokensActivos.delete(d.token);
        logger.warn(`[VerifTokens] Firma inválida para usuario ${d.usuarioId}`);
        throw new errors.ErrorAutorizacion(
            'TOKEN_FIRMA_INVALIDA',
            'El token de verificación es inválido'
        );
    }

    // Consumo: marcar como usado ANTES de devolver, para que un segundo
    // uso concurrente falle.
    registro.usado = true;
    tokensActivos.delete(d.token);

    logger.info(
        `[VerifTokens] Token validado y consumido: usuario=${d.usuarioId} ` +
        `monto=${monto} metodo=${metodo} bio=${registro.metodoBiometrico}`
    );

    return {
        valido: true,
        usuario_id: d.usuarioId,
        monto: monto,
        metodo: metodo,
        metodo_biometrico: registro.metodoBiometrico,
        metadata: registro.metadata
    };
}

// ================================================================
// CONSULTAR TOKEN (sin consumirlo)
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

function invalidarToken(token, usuarioId) {
    if (!token || typeof token !== 'string') return false;

    const registro = tokensActivos.get(token);

    if (!registro) return false;

    if (registro.usuarioId !== usuarioId) {
        logger.warn(`[VerifTokens] Usuario ${usuarioId} intentó invalidar token de otro`);
        return false;
    }

    tokensActivos.delete(token);
    logger.info(`[VerifTokens] Token invalidado por usuario ${usuarioId}`);

    return true;
}

// ================================================================
// INVALIDAR TODOS LOS TOKENS DE UN USUARIO
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
// Cada minuto elimina tokens expirados o usados.
// .unref() evita que el timer mantenga vivo el proceso.
// ================================================================

const cleanupInterval = setInterval(function () {
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

if (cleanupInterval.unref) {
    cleanupInterval.unref();
}

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
    requiereLiveness: requiereLiveness,

    TOKEN_TTL_MS: TOKEN_TTL_MS
};