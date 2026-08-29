// ================================================================
// UTILS/ENCRYPTION.JS
// FUNCIONES CRIPTOGRÁFICAS - SARIEL'S BACKEND
// ================================================================

const crypto = require('crypto');

// ================================================================
// HMAC-SHA-512
// ================================================================

/**
 * Genera una firma HMAC-SHA-512.
 *
 * IMPORTANTE:
 * NOWPayments firma el JSON recibido.
 * La serialización debe mantenerse consistente con el payload
 * que llega al backend.
 */
function generarHMAC(payload, secret) {
    if (!secret || typeof secret !== 'string') {
        throw new Error('HMAC secret no configurado');
    }

    if (payload === undefined || payload === null) {
        throw new Error('Payload requerido para generar HMAC');
    }

    return crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload), 'utf8')
        .digest('hex');
}

// ================================================================
// VERIFICACIÓN HMAC
// ================================================================

/**
 * Verifica una firma HMAC-SHA-512 utilizando comparación
 * resistente a ataques de timing.
 */
function verificarHMAC(payload, firmaRecibida, secret) {
    try {
        if (!firmaRecibida || typeof firmaRecibida !== 'string') {
            return false;
        }

        if (!secret || typeof secret !== 'string') {
            console.error('❌ HMAC secret no configurado');
            return false;
        }

        const firmaCalculada = generarHMAC(payload, secret);

        const recibida = Buffer.from(firmaRecibida, 'utf8');
        const calculada = Buffer.from(firmaCalculada, 'utf8');

        // timingSafeEqual exige buffers de igual longitud.
        if (recibida.length !== calculada.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            calculada,
            recibida
        );
    } catch (error) {
        console.error('❌ Error verificando HMAC:', error.message);
        return false;
    }
}

// ================================================================
// HMAC RECURSIVO
// ================================================================

/**
 * Verificación recursiva de estructuras.
 *
 * Se utiliza para normalizar estructuras JSON antes de generar
 * firmas cuando sea necesario mantener un orden determinista
 * de propiedades.
 *
 * NO modifica el objeto original.
 */
function normalizarRecursivo(valor) {
    if (Array.isArray(valor)) {
        return valor.map(normalizarRecursivo);
    }

    if (
        valor !== null &&
        typeof valor === 'object'
    ) {
        return Object.keys(valor)
            .sort()
            .reduce((resultado, clave) => {
                resultado[clave] = normalizarRecursivo(valor[clave]);
                return resultado;
            }, {});
    }

    return valor;
}

/**
 * Genera HMAC sobre una estructura normalizada.
 *
 * Se mantiene separado de generarHMAC() para no cambiar
 * silenciosamente la serialización utilizada por otros módulos.
 */
function generarHMACRecursivo(payload, secret) {
    if (!secret || typeof secret !== 'string') {
        throw new Error('HMAC secret no configurado');
    }

    const payloadNormalizado = normalizarRecursivo(payload);

    return crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payloadNormalizado), 'utf8')
        .digest('hex');
}

/**
 * Verifica HMAC recursivo.
 */
function verificarHMACRecursivo(payload, firmaRecibida, secret) {
    try {
        if (!firmaRecibida || typeof firmaRecibida !== 'string') {
            return false;
        }

        if (!secret || typeof secret !== 'string') {
            console.error('❌ HMAC secret no configurado');
            return false;
        }

        const firmaCalculada = generarHMACRecursivo(
            payload,
            secret
        );

        const recibida = Buffer.from(firmaRecibida, 'utf8');
        const calculada = Buffer.from(firmaCalculada, 'utf8');

        if (recibida.length !== calculada.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            calculada,
            recibida
        );
    } catch (error) {
        console.error(
            '❌ Error verificando HMAC recursivo:',
            error.message
        );

        return false;
    }
}

// ================================================================
// ID ÚNICO
// ================================================================

function generarId(prefix = '') {
    const id = crypto.randomUUID();

    return prefix
        ? `${prefix}-${id}`
        : id;
}

// ================================================================
// CÓDIGO ALEATORIO
// ================================================================

function generarCodigo(prefix = 'SAR', length = 6) {
    if (!Number.isInteger(length) || length < 4 || length > 64) {
        throw new Error(
            'La longitud del código debe estar entre 4 y 64 caracteres'
        );
    }

    const random = crypto
        .randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .toUpperCase()
        .slice(0, length);

    return `${prefix}-${random}`;
}

// ================================================================
// ENCRIPTACIÓN AES-256-GCM
// ================================================================

function obtenerClaveAES(secret) {
    if (!secret || typeof secret !== 'string') {
        throw new Error('Encryption secret no configurado');
    }

    const key = Buffer.from(secret, 'hex');

    if (key.length !== 32) {
        throw new Error(
            'El secret AES-256 debe contener exactamente 32 bytes en hexadecimal'
        );
    }

    return key;
}

// ================================================================
// ENCRIPTAR DATOS
// ================================================================

function encriptarDatos(data, secret) {
    const key = obtenerClaveAES(secret);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        key,
        iv
    );

    const plaintext = JSON.stringify(data);

    let encrypted = cipher.update(
        plaintext,
        'utf8',
        'hex'
    );

    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        encrypted,
        tag: tag.toString('hex')
    };
}

// ================================================================
// DESENCRIPTAR DATOS
// ================================================================

function desencriptarDatos(encryptedData, secret) {
    if (
        !encryptedData ||
        typeof encryptedData !== 'object'
    ) {
        throw new Error('Datos cifrados inválidos');
    }

    const {
        iv,
        encrypted,
        tag
    } = encryptedData;

    if (!iv || !encrypted || !tag) {
        throw new Error(
            'Faltan campos requeridos para desencriptar'
        );
    }

    const key = obtenerClaveAES(secret);

    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');

    if (ivBuffer.length !== 12) {
        throw new Error('IV inválido');
    }

    if (tagBuffer.length !== 16) {
        throw new Error('Auth tag inválido');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        ivBuffer
    );

    decipher.setAuthTag(tagBuffer);

    let decrypted = decipher.update(
        encrypted,
        'hex',
        'utf8'
    );

    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    generarHMAC,
    verificarHMAC,
    generarHMACRecursivo,
    verificarHMACRecursivo,
    normalizarRecursivo,
    generarId,
    generarCodigo,
    encriptarDatos,
    desencriptarDatos
};