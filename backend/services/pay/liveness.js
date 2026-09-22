// ================================================================
// SERVICES/PAY/LIVENESS.JS
// CSARIEL'S PAY - DETECCIÓN DE LIVENESS
// ================================================================
// Detecta si la persona frente a la cámara es real (no una foto
// ni un video pregrabado).
//
// Estrategia de 3 capas:
//   1. Interacción en vivo: acción aleatoria ("parpadea", "gira").
//   2. Análisis de frames: micro-movimientos naturales.
//   3. Score combinado: 0-1.
//
// El análisis pesado se hace en el frontend (face-api.js).
// El backend valida que el resultado sea plausible.
//
// Flujo:
//   1. Backend genera challenge + acción aleatoria.
//   2. Frontend pide al usuario hacer la acción.
//   3. Frontend captura frames + analiza.
//   4. Frontend manda score + metadata al backend.
//   5. Backend valida (con este archivo).
// ================================================================

'use strict';

const crypto = require('crypto');

const logger = require('../../utils/logger');
const errors = require('./errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

// Umbrales de liveness
const LIVENESS_SCORE_MINIMO = 0.80;      // Score global mínimo aceptable
const FRAMES_MINIMOS = 3;                 // Frames mínimos que debe capturar el frontend
const DURACION_MINIMA_MS = 1000;          // Duración mínima de la verificación (1 segundo)
const DURACION_MAXIMA_MS = 60000;         // Duración máxima (60 segundos)

// Acciones aleatorias que el usuario debe realizar
const ACCIONES_DISPONIBLES = [
    {
        id: 'parpadear',
        descripcion: 'Parpadea dos veces lentamente',
        validador: validarParpadeo
    },
    {
        id: 'girar_derecha',
        descripcion: 'Gira lentamente la cabeza hacia tu derecha',
        validador: validarGiroDerecha
    },
    {
        id: 'girar_izquierda',
        descripcion: 'Gira lentamente la cabeza hacia tu izquierda',
        validador: validarGiroIzquierda
    },
    {
        id: 'sonreir',
        descripcion: 'Sonríe ampliamente',
        validador: validarSonrisa
    },
    {
        id: 'abrir_boca',
        descripcion: 'Abre la boca lentamente',
        validador: validarBocaAbierta
    }
];

// Almacenamiento en memoria de challenges de liveness
// NOTA: si Railway reinicia, se pierden. Los usuarios simplemente repiten.
const challengesLiveness = new Map(); // challengeId -> { usuarioId, accion, expiraEn, iniciadoEn }

// TTL de 5 minutos
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Limpieza automática cada 1 minuto
setInterval(function () {
    const ahora = Date.now();
    let limpiados = 0;

    for (const [key, valor] of challengesLiveness.entries()) {
        if (valor.expiraEn < ahora) {
            challengesLiveness.delete(key);
            limpiados++;
        }
    }

    if (limpiados > 0) {
        logger.debug(`[Liveness] Limpiados ${limpiados} challenges expirados`);
    }
}, 60 * 1000);

// ================================================================
// HELPERS
// ================================================================

function generarChallenge() {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Genera un challenge de liveness con una acción aleatoria.
 */
function generarAccionAleatoria() {
    const index = Math.floor(Math.random() * ACCIONES_DISPONIBLES.length);
    return ACCIONES_DISPONIBLES[index];
}

/**
 * Normaliza un score (si viene como número, string, o porcentaje).
 */
function normalizarScore(valor) {
    const n = parseFloat(valor);

    if (!Number.isFinite(n)) return null;

    // Si viene como porcentaje (0-100), normalizar a 0-1
    if (n > 1 && n <= 100) {
        return n / 100;
    }

    // Si viene fuera de rango
    if (n < 0 || n > 1) return null;

    return n;
}

// ================================================================
// GENERAR CHALLENGE DE LIVENESS
// ================================================================

function generarChallengeLiveness(usuarioId) {
    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const challenge = generarChallenge();
    const challengeId = crypto.randomBytes(16).toString('hex');
    const accion = generarAccionAleatoria();

    challengesLiveness.set(challengeId, {
        usuarioId: usuarioId,
        challenge: challenge,
        accion: accion.id,
        expiraEn: Date.now() + CHALLENGE_TTL_MS,
        iniciadoEn: Date.now(),
        usado: false
    });

    logger.info(`[Liveness] Challenge generado para usuario ${usuarioId} (acción: ${accion.id})`);

    return {
        challenge_id: challengeId,
        challenge: challenge,
        accion: accion.id,
        instruccion: accion.descripcion,
        timeout: CHALLENGE_TTL_MS,
        frames_minimos: FRAMES_MINIMOS,
        duracion_minima_ms: DURACION_MINIMA_MS,
        duracion_maxima_ms: DURACION_MAXIMA_MS
    };
}

// ================================================================
// VALIDAR RESULTADO DE LIVENESS
// ================================================================
// El frontend manda:
//   - challenge_id
//   - liveness_score (0-1): confianza de que sea persona real
//   - frame_count: cuántos frames capturó
//   - duracion_ms: cuánto duró la verificación
//   - accion_completada: boolean, si el usuario realizó la acción
//   - micro_movimientos: número de micro-movimientos detectados
//
// El backend valida que:
//   - El challenge exista y no esté usado.
//   - Los scores sean plausibles.
//   - Los frames sean suficientes.
//   - La duración sea razonable.
//   - La acción solicitada se haya completado.
// ================================================================

function validarResultadoLiveness(usuarioId, datos) {
    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!datos || !datos.challenge_id) {
        throw errors.errorParametroRequerido('challenge_id');
    }

    // Recuperar challenge
    const registro = challengesLiveness.get(datos.challenge_id);

    if (!registro) {
        throw new errors.ErrorValidacion(
            'LIVENESS_CHALLENGE_NO_ENCONTRADO',
            'El challenge de liveness expiró o no existe'
        );
    }

    if (registro.usuarioId !== usuarioId) {
        challengesLiveness.delete(datos.challenge_id);
        logger.warning(`[Liveness] Usuario ${usuarioId} intentó usar challenge de otro usuario`);
        throw errors.errorNoEsPropietario();
    }

    if (registro.expiraEn < Date.now()) {
        challengesLiveness.delete(datos.challenge_id);
        throw new errors.ErrorValidacion('LIVENESS_CHALLENGE_EXPIRADO', 'El challenge expiró');
    }

    if (registro.usado) {
        challengesLiveness.delete(datos.challenge_id);
        throw new errors.ErrorValidacion('LIVENESS_CHALLENGE_USADO', 'Este challenge ya fue utilizado');
    }

    // Consumir challenge
    registro.usado = true;

    // ---------- Validar liveness_score ----------
    const livenessScore = normalizarScore(datos.liveness_score);

    if (livenessScore === null) {
        logger.warning(`[Liveness] Score inválido para usuario ${usuarioId}: ${datos.liveness_score}`);
        throw new errors.ErrorValidacion(
            'LIVENESS_SCORE_INVALIDO',
            'El resultado de liveness es inválido'
        );
    }

    if (livenessScore < LIVENESS_SCORE_MINIMO) {
        logger.warning(
            `[Liveness] Score bajo para usuario ${usuarioId}: ${livenessScore.toFixed(2)}`
        );
        throw new errors.ErrorAutorizacion(
            'LIVENESS_SCORE_BAJO',
            'No se pudo verificar que seas una persona real. Intenta de nuevo con mejor iluminación.'
        );
    }

    // ---------- Validar frame_count ----------
    const frameCount = parseInt(datos.frame_count, 10);

    if (!Number.isFinite(frameCount) || frameCount < FRAMES_MINIMOS) {
        logger.warning(`[Liveness] Frames insuficientes para usuario ${usuarioId}: ${frameCount}`);
        throw new errors.ErrorValidacion(
            'LIVENESS_FRAMES_INSUFICIENTES',
            `Se requieren al menos ${FRAMES_MINIMOS} frames para verificar`
        );
    }

    // ---------- Validar duración ----------
    const duracion = parseInt(datos.duracion_ms, 10);

    if (!Number.isFinite(duracion)) {
        throw new errors.ErrorValidacion('LIVENESS_DURACION_INVALIDA', 'La duración de la verificación es inválida');
    }

    if (duracion < DURACION_MINIMA_MS) {
        logger.warning(`[Liveness] Verificación muy rápida para usuario ${usuarioId}: ${duracion}ms`);
        throw new errors.ErrorValidacion(
            'LIVENESS_DURACION_MINIMA',
            'La verificación fue demasiado rápida. Intenta de nuevo.'
        );
    }

    if (duracion > DURACION_MAXIMA_MS) {
        logger.warning(`[Liveness] Verificación muy lenta para usuario ${usuarioId}: ${duracion}ms`);
        throw new errors.ErrorValidacion(
            'LIVENESS_DURACION_MAXIMA',
            'La verificación tardó demasiado. Intenta de nuevo.'
        );
    }

    // ---------- Validar acción completada ----------
    if (datos.accion_completada !== true) {
        logger.warning(`[Liveness] Acción no completada por usuario ${usuarioId}`);
        throw new errors.ErrorAutorizacion(
            'LIVENESS_ACCION_NO_COMPLETADA',
            'No se completó la acción solicitada. Intenta de nuevo.'
        );
    }

    // ---------- Validar acción correcta ----------
    const accionSolicitada = registro.accion;
    const accionReportada = datos.accion_realizada;

    if (accionReportada && accionReportada !== accionSolicitada) {
        logger.warning(
            `[Liveness] Acción incorrecta para usuario ${usuarioId}: ` +
            `esperada=${accionSolicitada} reportada=${accionReportada}`
        );
        throw new errors.ErrorValidacion(
            'LIVENESS_ACCION_INCORRECTA',
            'La acción reportada no coincide con la solicitada'
        );
    }

    // ---------- Validar micro_movimientos ----------
    const microMovimientos = parseInt(datos.micro_movimientos, 10);

    if (Number.isFinite(microMovimientos) && microMovimientos < 1) {
        logger.warning(`[Liveness] Sin micro-movimientos para usuario ${usuarioId}`);
        throw new errors.ErrorValidacion(
            'LIVENESS_SIN_MOVIMIENTO',
            'No se detectaron micro-movimientos. Intenta de nuevo.'
        );
    }

    // ---------- Todo bien ----------
    logger.info(
        `[Liveness] Verificación exitosa para usuario ${usuarioId} ` +
        `(score: ${livenessScore.toFixed(2)}, frames: ${frameCount}, ` +
        `duración: ${duracion}ms, acción: ${accionSolicitada})`
    );

    return {
        valido: true,
        liveness_score: livenessScore,
        frame_count: frameCount,
        duracion_ms: duracion,
        accion: accionSolicitada,
        micro_movimientos: microMovimientos || 0
    };
}

// ================================================================
// VALIDADORES DE ACCIONES
// ================================================================
// Los validadores se llaman desde el frontend (que ya analizó los frames).
// Aquí solo exponemos las firmas para consistencia.
// En el futuro podrían correrse server-side si se sube el video.
// ================================================================

/**
 * Valida que el usuario haya parpadeado.
 * El frontend analiza los frames y detecta cambios en los ojos.
 */
function validarParpadeo(metadata) {
    // El frontend ya hizo el análisis.
    // Aquí validamos que el reporte sea plausible.
    const m = metadata || {};

    if (typeof m.parpadeo_detectado !== 'boolean') {
        return { valido: false, motivo: 'parpadeo_no_reportado' };
    }

    if (!m.parpadeo_detectado) {
        return { valido: false, motivo: 'parpadeo_no_detectado' };
    }

    return { valido: true };
}

/**
 * Valida que el usuario haya girado a la derecha.
 */
function validarGiroDerecha(metadata) {
    const m = metadata || {};

    if (typeof m.giro_derecha_detectado !== 'boolean') {
        return { valido: false, motivo: 'giro_no_reportado' };
    }

    if (!m.giro_derecha_detectado) {
        return { valido: false, motivo: 'giro_no_detectado' };
    }

    return { valido: true };
}

/**
 * Valida que el usuario haya girado a la izquierda.
 */
function validarGiroIzquierda(metadata) {
    const m = metadata || {};

    if (typeof m.giro_izquierda_detectado !== 'boolean') {
        return { valido: false, motivo: 'giro_no_reportado' };
    }

    if (!m.giro_izquierda_detectado) {
        return { valido: false, motivo: 'giro_no_detectado' };
    }

    return { valido: true };
}

/**
 * Valida que el usuario haya sonreído.
 */
function validarSonrisa(metadata) {
    const m = metadata || {};

    if (typeof m.sonrisa_detectada !== 'boolean') {
        return { valido: false, motivo: 'sonrisa_no_reportada' };
    }

    if (!m.sonrisa_detectada) {
        return { valido: false, motivo: 'sonrisa_no_detectada' };
    }

    return { valido: true };
}

/**
 * Valida que el usuario haya abierto la boca.
 */
function validarBocaAbierta(metadata) {
    const m = metadata || {};

    if (typeof m.boca_abierta_detectada !== 'boolean') {
        return { valido: false, motivo: 'boca_no_reportada' };
    }

    if (!m.boca_abierta_detectada) {
        return { valido: false, motivo: 'boca_no_detectada' };
    }

    return { valido: true };
}

// ================================================================
// UTILIDADES PARA EL FRONTEND
// ================================================================
// El frontend necesita saber qué acción le tocó y cómo reportarla.
// Estas funciones le ayudan.
// ================================================================

/**
 * Devuelve la lista de acciones disponibles con sus IDs.
 * Útil para debugging y para el frontend.
 */
function listarAccionesDisponibles() {
    return ACCIONES_DISPONIBLES.map(function (a) {
        return {
            id: a.id,
            descripcion: a.descripcion
        };
    });
}

/**
 * Devuelve la configuración de umbrales de liveness.
 */
function obtenerConfiguracion() {
    return {
        liveness_score_minimo: LIVENESS_SCORE_MINIMO,
        frames_minimos: FRAMES_MINIMOS,
        duracion_minima_ms: DURACION_MINIMA_MS,
        duracion_maxima_ms: DURACION_MAXIMA_MS,
        acciones_disponibles: ACCIONES_DISPONIBLES.map(function (a) { return a.id; })
    };
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    // Flujo principal
    generarChallengeLiveness: generarChallengeLiveness,
    validarResultadoLiveness: validarResultadoLiveness,

    // Utilidades
    listarAccionesDisponibles: listarAccionesDisponibles,
    obtenerConfiguracion: obtenerConfiguracion,
    normalizarScore: normalizarScore,

    // Constantes
    LIVENESS_SCORE_MINIMO: LIVENESS_SCORE_MINIMO,
    FRAMES_MINIMOS: FRAMES_MINIMOS,
    DURACION_MINIMA_MS: DURACION_MINIMA_MS,
    DURACION_MAXIMA_MS: DURACION_MAXIMA_MS
};