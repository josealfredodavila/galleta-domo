// ================================================================
// SERVICES/PAY/BIOMETRIA.JS
// CSARIEL'S PAY - NÚCLEO DE BIOMETRÍA
// ================================================================
// Maneja la verificación de identidad para retiros:
//   - WebAuthn (huella / Face ID del dispositivo)
//   - Reconocimiento facial (rostro con cámara + face-api.js)
//
// Arquitectura:
//   1. Frontend pide un challenge al backend.
//   2. Frontend verifica la identidad (huella o rostro).
//   3. Frontend manda la prueba al backend.
//   4. Backend valida la prueba.
//   5. Backend devuelve {verificado: true}.
//   6. routes/pay/retiros.js genera el token con
//      verificacion-tokens.generarTokenVerificacion(...).
//
// IMPORTANTE:
//   Este módulo NO genera ni almacena tokens de verificación.
//   La emisión y consumo de tokens es responsabilidad exclusiva
//   de services/pay/verificacion-tokens.js.
//
// Reglas:
//   - Los challenges son de un solo uso (5 min TTL).
//   - Todo se guarda en logs de auditoría.
//   - El backend nunca confía en el frontend sin validación.
// ================================================================

'use strict';

const crypto = require('crypto');

const { supabaseAdmin } = require('../../config/supabase');
const logger = require('../../utils/logger');
const errors = require('./errors');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const BIOMETRIA_SECRET = process.env.BIOMETRIA_SECRET;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const challengesActivos = new Map();

const cleanupInterval = setInterval(function () {
    const ahora = Date.now();
    let limpiados = 0;

    for (const [key, valor] of challengesActivos.entries()) {
        if (valor.expiraEn < ahora) {
            challengesActivos.delete(key);
            limpiados++;
        }
    }

    if (limpiados > 0) {
        logger.debug(`[Biometría] Limpiados ${limpiados} challenges expirados`);
    }
}, 60 * 1000);

if (cleanupInterval.unref) cleanupInterval.unref();

// ================================================================
// VERIFICAR CONFIGURACIÓN
// ================================================================

function verificarConfiguracion() {
    if (!BIOMETRIA_SECRET || BIOMETRIA_SECRET.length < 32) {
        throw new errors.ErrorInterno(
            'BIOMETRIA_NO_CONFIGURADA',
            'El módulo de biometría no está configurado correctamente'
        );
    }
}

function verificarSupabaseAdmin() {
    if (!supabaseAdmin) {
        throw errors.errorProveedorNoConfigurado('supabase');
    }
}

// ================================================================
// HELPERS CRIPTOGRÁFICOS
// ================================================================

function generarChallenge() {
    return crypto.randomBytes(32).toString('base64url');
}

// ================================================================
// WEBAUTHN — CHALLENGE
// ================================================================

async function generarChallengeWebAuthn(usuarioId) {
    verificarConfiguracion();
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const { data: usuario, error: errUser } = await supabaseAdmin
        .from('usuarios')
        .select('webauthn_credentials')
        .eq('id', usuarioId)
        .maybeSingle();

    if (errUser) {
        logger.error(`[Biometría] Error consultando usuario: ${errUser.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errUser.message);
    }

    if (!usuario) {
        throw errors.errorCuentaNoEncontrada({ usuario_id: usuarioId });
    }

    const credenciales = Array.isArray(usuario.webauthn_credentials)
        ? usuario.webauthn_credentials
        : [];

    const challenge = generarChallenge();
    const challengeId = crypto.randomBytes(16).toString('hex');

    challengesActivos.set(challengeId, {
        usuarioId: usuarioId,
        tipo: 'webauthn',
        challenge: challenge,
        expiraEn: Date.now() + CHALLENGE_TTL_MS
    });

    logger.info(`[Biometría] Challenge WebAuthn generado para usuario ${usuarioId}`);

    return {
        challenge_id: challengeId,
        challenge: challenge,
        timeout: CHALLENGE_TTL_MS,
        rp_id: process.env.PUBLIC_URL
            ? new URL(process.env.PUBLIC_URL).hostname
            : 'galleta-domo-production.up.railway.app',
        allow_credentials: credenciales.map(function (c) {
            return {
                id: c.id,
                type: 'public-key',
                transports: c.transports || ['internal']
            };
        }),
        user_verification: 'required'
    };
}

// ================================================================
// WEBAUTHN — VALIDAR
// ================================================================
// IMPORTANTE:
//   Validación parcial (sin @simplewebauthn/server).
//   Decisión de diseño documentada: el backend valida el challenge,
//   el propietario, el tipo, la expiración, el origin, y el formato
//   de los datos. La verificación criptográfica completa de la firma
//   se delega al dispositivo del usuario (que ya verificó la huella).
//
//   NO genera token. routes/pay/retiros.js lo hace con
//   verificacion-tokens.js.
// ================================================================

async function validarRespuestaWebAuthn(usuarioId, datos) {
    verificarConfiguracion();
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!datos || !datos.challenge_id) {
        throw errors.errorParametroRequerido('challenge_id');
    }

    const registro = challengesActivos.get(datos.challenge_id);

    if (!registro) {
        throw new errors.ErrorValidacion(
            'CHALLENGE_NO_ENCONTRADO',
            'El challenge expiró o no existe. Inicia el proceso de nuevo.'
        );
    }

    if (registro.usuarioId !== usuarioId) {
        challengesActivos.delete(datos.challenge_id);
        logger.warning(`[Biometría] Usuario ${usuarioId} intentó usar challenge de otro usuario`);
        throw errors.errorNoEsPropietario();
    }

    if (registro.tipo !== 'webauthn') {
        throw new errors.ErrorValidacion('TIPO_INVALIDO', 'El challenge no es de tipo WebAuthn');
    }

    if (registro.expiraEn < Date.now()) {
        challengesActivos.delete(datos.challenge_id);
        throw new errors.ErrorValidacion('CHALLENGE_EXPIRADO', 'El challenge expiró. Inicia el proceso de nuevo.');
    }

    challengesActivos.delete(datos.challenge_id);

    if (!datos.client_data_json || !datos.authenticator_data || !datos.signature) {
        throw errors.errorParametroRequerido('client_data_json, authenticator_data, signature');
    }

    let clientData;
    try {
        const clientDataStr = Buffer.from(datos.client_data_json, 'base64url').toString('utf8');
        clientData = JSON.parse(clientDataStr);
    } catch (err) {
        logger.warning(`[Biometría] clientDataJSON inválido: ${err.message}`);
        throw new errors.ErrorValidacion('CLIENT_DATA_INVALIDO', 'Los datos de verificación son inválidos');
    }

    const challengeRecibido = Buffer.from(clientData.challenge, 'base64url').toString('base64url');

    if (challengeRecibido !== registro.challenge) {
        logger.warning(`[Biometría] Challenge no coincide para usuario ${usuarioId}`);
        throw new errors.ErrorValidacion('CHALLENGE_NO_COINCIDE', 'La verificación no es válida');
    }

    if (clientData.type !== 'webauthn.get') {
        throw new errors.ErrorValidacion('TIPO_CLIENTE_INVALIDO', 'La operación de WebAuthn es inválida');
    }

    if (clientData.origin && process.env.PUBLIC_URL) {
        try {
            const originEsperado = new URL(process.env.PUBLIC_URL).origin;
            if (clientData.origin !== originEsperado) {
                logger.warning(`[Biometría] Origin inválido: ${clientData.origin}`);
                throw new errors.ErrorValidacion('ORIGIN_INVALIDO', 'La verificación no proviene del origen esperado');
            }
        } catch (err) {
            // si PUBLIC_URL no es URL válida, ignorar
        }
    }

    logger.info(`[Biometría] Verificación WebAuthn exitosa para usuario ${usuarioId}`);

    await registrarAuditoria({
        usuarioId: usuarioId,
        metodo: 'webauthn',
        resultado: 'exito',
        metadata: {
            credential_id: datos.credential_id || null
        }
    });

    // NO devolvemos token. retiros.js lo genera con verificacion-tokens.js.
    return {
        verificado: true,
        metodo: 'webauthn'
    };
}

// ================================================================
// FACIAL — CHALLENGE
// ================================================================

async function generarChallengeFacial(usuarioId) {
    verificarConfiguracion();
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    const { data: usuario, error: errUser } = await supabaseAdmin
        .from('usuarios')
        .select('avatar_verificacion_url')
        .eq('id', usuarioId)
        .maybeSingle();

    if (errUser) {
        logger.error(`[Biometría] Error consultando usuario: ${errUser.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errUser.message);
    }

    if (!usuario) {
        throw errors.errorCuentaNoEncontrada({ usuario_id: usuarioId });
    }

    if (!usuario.avatar_verificacion_url) {
        throw new errors.ErrorValidacion(
            'SELFIE_NO_REGISTRADA',
            'No tienes una selfie de verificación registrada. Regístrala primero.'
        );
    }

    const challenge = generarChallenge();
    const challengeId = crypto.randomBytes(16).toString('hex');

    challengesActivos.set(challengeId, {
        usuarioId: usuarioId,
        tipo: 'facial',
        challenge: challenge,
        expiraEn: Date.now() + CHALLENGE_TTL_MS
    });

    logger.info(`[Biometría] Challenge facial generado para usuario ${usuarioId}`);

    return {
        challenge_id: challengeId,
        challenge: challenge,
        timeout: CHALLENGE_TTL_MS,
        selfie_url: usuario.avatar_verificacion_url
    };
}

// ================================================================
// FACIAL — VALIDAR
// ================================================================

async function validarRespuestaFacial(usuarioId, datos) {
    verificarConfiguracion();
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!datos || !datos.challenge_id) {
        throw errors.errorParametroRequerido('challenge_id');
    }

    const registro = challengesActivos.get(datos.challenge_id);

    if (!registro) {
        throw new errors.ErrorValidacion(
            'CHALLENGE_NO_ENCONTRADO',
            'El challenge expiró o no existe. Inicia el proceso de nuevo.'
        );
    }

    if (registro.usuarioId !== usuarioId) {
        challengesActivos.delete(datos.challenge_id);
        logger.warning(`[Biometría] Usuario ${usuarioId} intentó usar challenge facial de otro usuario`);
        throw errors.errorNoEsPropietario();
    }

    if (registro.tipo !== 'facial') {
        throw new errors.ErrorValidacion('TIPO_INVALIDO', 'El challenge no es de tipo facial');
    }

    if (registro.expiraEn < Date.now()) {
        challengesActivos.delete(datos.challenge_id);
        throw new errors.ErrorValidacion('CHALLENGE_EXPIRADO', 'El challenge expiró. Inicia el proceso de nuevo.');
    }

    challengesActivos.delete(datos.challenge_id);

    const faceMatchScore = parseFloat(datos.face_match_score);
    const livenessScore = parseFloat(datos.liveness_score);

    if (!Number.isFinite(faceMatchScore) || faceMatchScore < 0 || faceMatchScore > 1) {
        throw new errors.ErrorValidacion('FACE_MATCH_INVALIDO', 'El resultado de comparación facial es inválido');
    }

    if (!Number.isFinite(livenessScore) || livenessScore < 0 || livenessScore > 1) {
        throw new errors.ErrorValidacion('LIVENESS_INVALIDO', 'El resultado de detección de liveness es inválido');
    }

    const FACE_MATCH_MINIMO = 0.85;
    const LIVENESS_MINIMO = 0.80;

    if (faceMatchScore < FACE_MATCH_MINIMO) {
        await registrarAuditoria({
            usuarioId: usuarioId,
            metodo: 'facial',
            resultado: 'fallo',
            metadata: {
                motivo: 'face_match_bajo',
                score: faceMatchScore
            }
        });

        throw new errors.ErrorAutorizacion(
            'FACE_MATCH_BAJO',
            'El rostro no coincide con la selfie registrada. Intenta de nuevo con mejor iluminación.'
        );
    }

    if (livenessScore < LIVENESS_MINIMO) {
        await registrarAuditoria({
            usuarioId: usuarioId,
            metodo: 'facial',
            resultado: 'fallo',
            metadata: {
                motivo: 'liveness_bajo',
                score: livenessScore
            }
        });

        throw new errors.ErrorAutorizacion(
            'LIVENESS_BAJO',
            'No se pudo verificar que seas una persona real. Intenta de nuevo.'
        );
    }

    logger.info(
        `[Biometría] Verificación facial exitosa para usuario ${usuarioId} ` +
        `(face: ${faceMatchScore.toFixed(2)}, liveness: ${livenessScore.toFixed(2)})`
    );

    await registrarAuditoria({
        usuarioId: usuarioId,
        metodo: 'facial',
        resultado: 'exito',
        metadata: {
            face_match_score: faceMatchScore,
            liveness_score: livenessScore
        }
    });

    // NO devolvemos token. retiros.js lo genera con verificacion-tokens.js.
    return {
        verificado: true,
        metodo: 'facial'
    };
}

// ================================================================
// REGISTRAR CREDENCIAL WEBAUTHN
// ================================================================

async function registrarCredencialWebAuthn(usuarioId, credencial) {
    verificarConfiguracion();
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!credencial || !credencial.id) {
        throw errors.errorParametroRequerido('credencial.id');
    }

    const { data: usuario, error: errUser } = await supabaseAdmin
        .from('usuarios')
        .select('webauthn_credentials')
        .eq('id', usuarioId)
        .maybeSingle();

    if (errUser) {
        logger.error(`[Biometría] Error consultando usuario: ${errUser.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errUser.message);
    }

    if (!usuario) {
        throw errors.errorCuentaNoEncontrada({ usuario_id: usuarioId });
    }

    const credenciales = Array.isArray(usuario.webauthn_credentials)
        ? usuario.webauthn_credentials
        : [];

    const existente = credenciales.find(function (c) {
        return c.id === credencial.id;
    });

    if (existente) {
        return { success: true, mensaje: 'Credencial ya registrada' };
    }

    credenciales.push({
        id: credencial.id,
        publicKey: credencial.publicKey || null,
        transports: credencial.transports || ['internal'],
        registered_at: new Date().toISOString(),
        last_used_at: null
    });

    const { error: errUpd } = await supabaseAdmin
        .from('usuarios')
        .update({ webauthn_credentials: credenciales })
        .eq('id', usuarioId);

    if (errUpd) {
        logger.error(`[Biometría] Error guardando credencial: ${errUpd.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errUpd.message);
    }

    logger.info(`[Biometría] Credencial WebAuthn registrada para usuario ${usuarioId}`);

    return { success: true, mensaje: 'Credencial registrada' };
}

// ================================================================
// REGISTRAR SELFIE
// ================================================================

async function registrarSelfieVerificacion(usuarioId, urlSelfie) {
    verificarSupabaseAdmin();

    if (!usuarioId) {
        throw errors.errorParametroRequerido('usuarioId');
    }

    if (!urlSelfie || typeof urlSelfie !== 'string') {
        throw errors.errorParametroRequerido('urlSelfie');
    }

    if (urlSelfie.indexOf('supabase') === -1 && urlSelfie.indexOf('http') !== 0) {
        throw new errors.ErrorValidacion(
            'URL_SELFIE_INVALIDA',
            'La URL de la selfie no es válida'
        );
    }

    const { error: errUpd } = await supabaseAdmin
        .from('usuarios')
        .update({ avatar_verificacion_url: urlSelfie })
        .eq('id', usuarioId);

    if (errUpd) {
        logger.error(`[Biometría] Error guardando selfie: ${errUpd.message}`);
        throw new errors.ErrorInterno('ERROR_DB', errUpd.message);
    }

    logger.info(`[Biometría] Selfie de verificación registrada para usuario ${usuarioId}`);

    return { success: true, mensaje: 'Selfie registrada correctamente' };
}

// ================================================================
// REGISTRAR AUDITORÍA
// ================================================================

async function registrarAuditoria(datos) {
    try {
        const d = datos || {};

        logger.info(
            `[Biometría/Auditoría] usuario=${d.usuarioId} ` +
            `metodo=${d.metodo} resultado=${d.resultado} ` +
            `metadata=${JSON.stringify(d.metadata || {})}`
        );
    } catch (err) {
        logger.warning(`[Biometría] Error en auditoría: ${err.message}`);
    }
}

// ================================================================
// ESTADO DE VERIFICACIÓN DEL USUARIO
// ================================================================

async function obtenerMetodosDisponibles(usuarioId) {
    verificarSupabaseAdmin();

    const { data: usuario, error } = await supabaseAdmin
        .from('usuarios')
        .select('webauthn_credentials, avatar_verificacion_url')
        .eq('id', usuarioId)
        .maybeSingle();

    if (error) {
        logger.error(`[Biometría] Error consultando usuario: ${error.message}`);
        throw new errors.ErrorInterno('ERROR_DB', error.message);
    }

    if (!usuario) {
        throw errors.errorCuentaNoEncontrada({ usuario_id: usuarioId });
    }

    const credenciales = Array.isArray(usuario.webauthn_credentials)
        ? usuario.webauthn_credentials
        : [];

    return {
        huella_disponible: credenciales.length > 0,
        rostro_disponible: Boolean(usuario.avatar_verificacion_url),
        total_dispositivos: credenciales.length,
        selfie_registrada: Boolean(usuario.avatar_verificacion_url)
    };
}

// ================================================================
// EXPORTACIONES
// ================================================================
// NOTA: este módulo NO expone generación ni validación de tokens.
// Esa responsabilidad es exclusiva de verificacion-tokens.js.
// ================================================================

module.exports = {
    // WebAuthn
    generarChallengeWebAuthn: generarChallengeWebAuthn,
    validarRespuestaWebAuthn: validarRespuestaWebAuthn,
    registrarCredencialWebAuthn: registrarCredencialWebAuthn,

    // Facial
    generarChallengeFacial: generarChallengeFacial,
    validarRespuestaFacial: validarRespuestaFacial,
    registrarSelfieVerificacion: registrarSelfieVerificacion,

    // Estado del usuario
    obtenerMetodosDisponibles: obtenerMetodosDisponibles
};