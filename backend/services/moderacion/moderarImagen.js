// ================================================================
// SERVICES/MODERACION/MODERARIMAGEN.JS
// Sariel's Ecosystem — Moderación de imágenes con AWS Rekognition
// ================================================================
// Uso:
//   const { moderarImagen } = require('../../services/moderacion/moderarImagen');
//   const resultado = await moderarImagen(buffer);
//   if (!resultado.ok) { /* rechazar */ }
//
// Contrato:
//   Entrada:  Buffer con bytes de imagen (JPEG o PNG)
//   Salida:   { ok: true }
//           | { ok: false, motivo: 'tipo_invalido' | 'tamano_invalido'
//                              | 'contenido_no_permitido' | 'timeout'
//                              | 'servicio_no_disponible',
//               detalle?: string, etiquetas?: array }
//
// Reglas:
//   - Detecta el tipo real por magic bytes (no confía en mimetype).
//   - Acepta JPEG y PNG. WebP se rechaza: Rekognition no lo analiza.
//   - Tamaño máximo configurable vía MODERACION_MAX_BYTES (default 5 MB).
//   - Umbral configurable vía MODERACION_UMBRAL (default 80).
//   - Fail closed: si Rekognition falla o tarda > timeout, rechaza.
//   - Los errores de AWS se registran con su tipo para poder diagnosticarlos.
//   - Las etiquetas "Suggestive" se registran en log pero NO bloquean.
// ================================================================

'use strict';

const {
    RekognitionClient,
    DetectModerationLabelsCommand
} = require('@aws-sdk/client-rekognition');

// ================================================================
// CONFIGURACIÓN (leída desde process.env, nunca hardcodeada)
// ================================================================

const UMBRAL = Number(process.env.MODERACION_UMBRAL) || 80;

const MAX_BYTES = Number(process.env.MODERACION_MAX_BYTES) || (5 * 1024 * 1024);

const TIMEOUT_MS = Number(process.env.MODERACION_TIMEOUT_MS) || 10000;

// Etiquetas que BLOQUEAN la subida (comparadas con Name o ParentName)
// Referencia: https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html
const ETIQUETAS_BLOQUEADAS = new Set([
    'Explicit Nudity',
    'Explicit Nudity of Intimate parts and Kissing',
    'Exposed Genitalia',
    'Exposed Female Nipple',
    'Female Swimwear Or Underwear',
    'Male Swimwear Or Underwear',
    'Violence',
    'Graphic Violence Or Gore',
    'Physical Violence',
    'Weapon Violence',
    'Weapons',
    'Visually Disturbing',
    'Emaciated Bodies',
    'Corpses',
    'Hanging',
    'Air Crash',
    'Explosions and Blasts',
    'Hate Symbols',
    'Nazi Party',
    'White Supremacy',
    'Extremist'
]);

// ================================================================
// CLIENTE REKOGNITION (singleton)
// ================================================================

let clienteRekognition = null;

function obtenerCliente() {
    if (clienteRekognition) return clienteRekognition;

    const region = process.env.AWS_REGION || 'us-east-1';

    // El SDK toma AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY
    // automáticamente desde process.env.
    clienteRekognition = new RekognitionClient({ region });

    return clienteRekognition;
}

// Aviso al arrancar si faltan credenciales (no bloquea, solo informa)
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('⚠️ [ModerarImagen] Faltan AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY. Toda subida será rechazada.');
}

// ================================================================
// DETECCIÓN DE TIPO POR MAGIC BYTES
// ================================================================

function detectarTipo(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 &&
        buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A &&
        buffer[6] === 0x1A && buffer[7] === 0x0A
    ) {
        return 'image/png';
    }

    // WebP: "RIFF" .... "WEBP"
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 &&
        buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 &&
        buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

// ================================================================
// TIMEOUT HELPER
// ================================================================

function conTimeout(promesa, ms, mensaje) {
    let timeoutId = null;

    const timeoutPromesa = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(mensaje)), ms);
    });

    return Promise.race([promesa, timeoutPromesa]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}

// ================================================================
// MODERAR IMAGEN
// ================================================================

/**
 * Modera un buffer de imagen con AWS Rekognition.
 * @param {Buffer} buffer — bytes de la imagen
 * @returns {Promise<{ok: boolean, motivo?: string, detalle?: string, etiquetas?: array}>}
 */
async function moderarImagen(buffer) {
    // 1) Validar tipo real
    const tipo = detectarTipo(buffer);
    if (!tipo) {
        return { ok: false, motivo: 'tipo_invalido', detalle: 'Solo JPEG o PNG' };
    }

    // Rekognition no analiza WebP: se rechaza con un motivo claro
    if (tipo === 'image/webp') {
        return {
            ok: false,
            motivo: 'tipo_invalido',
            detalle: 'WebP no soportado para revisión. Sube la imagen en JPEG o PNG.'
        };
    }

    // 2) Validar tamaño
    if (buffer.length > MAX_BYTES) {
        return {
            ok: false,
            motivo: 'tamano_invalido',
            detalle: `Supera ${Math.floor(MAX_BYTES / 1024 / 1024)} MB`
        };
    }

    // 3) Llamar a Rekognition con timeout
    let respuesta;
    try {
        const cliente = obtenerCliente();

        const comando = new DetectModerationLabelsCommand({
            Image: { Bytes: buffer },
            MinConfidence: 50
        });

        respuesta = await conTimeout(
            cliente.send(comando),
            TIMEOUT_MS,
            'moderacion_timeout'
        );
    } catch (error) {
        if (error.message === 'moderacion_timeout') {
            return { ok: false, motivo: 'timeout' };
        }

        // Registrar el tipo de error de AWS para diagnosticar la causa real
        const codigo = error.name || 'ErrorDesconocido';
        const estado = error.$metadata && error.$metadata.httpStatusCode;
        console.error(
            `❌ [ModerarImagen] Error de Rekognition: ${codigo}` +
            (estado ? ` (HTTP ${estado})` : '') +
            ` — ${error.message || ''}`
        );

        // Formato de imagen rechazado por AWS: es un problema del archivo
        if (codigo === 'InvalidImageFormatException') {
            return { ok: false, motivo: 'tipo_invalido', detalle: 'Formato no aceptado por el servicio' };
        }

        // Credenciales, permisos o servicio caído: fail closed
        return { ok: false, motivo: 'servicio_no_disponible', detalle: codigo };
    }

    // 4) Analizar etiquetas
    const etiquetas = respuesta && Array.isArray(respuesta.ModerationLabels)
        ? respuesta.ModerationLabels
        : [];

    const bloqueadas = etiquetas.filter((etiqueta) => {
        const confianza = Number(etiqueta.Confidence) || 0;
        if (confianza < UMBRAL) return false;

        const name = etiqueta.Name || '';
        const parent = etiqueta.ParentName || '';

        return ETIQUETAS_BLOQUEADAS.has(name) || ETIQUETAS_BLOQUEADAS.has(parent);
    });

    // 5) Registrar sugerentes en log (sin bloquear)
    const sugerentes = etiquetas.filter((etiqueta) => {
        const confianza = Number(etiqueta.Confidence) || 0;
        if (confianza < UMBRAL) return false;
        const name = etiqueta.Name || '';
        const parent = etiqueta.ParentName || '';
        return name === 'Suggestive' || parent === 'Suggestive';
    });

    if (sugerentes.length > 0) {
        console.warn(
            '⚠️ [ModerarImagen] Etiquetas sugerentes (no bloquean):',
            sugerentes.map((e) => `${e.Name} (${Math.round(e.Confidence)}%)`).join(', ')
        );
    }

    // 6) Decisión
    if (bloqueadas.length > 0) {
        return {
            ok: false,
            motivo: 'contenido_no_permitido',
            etiquetas: bloqueadas.map((e) => ({
                name: e.Name,
                parent: e.ParentName,
                confidence: Math.round(e.Confidence)
            }))
        };
    }

    return { ok: true };
}

// ================================================================
// EXPORT
// ================================================================

module.exports = { moderarImagen };
