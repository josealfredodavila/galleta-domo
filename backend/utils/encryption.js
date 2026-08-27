// ================================================================
// FUNCIONES DE ENCRIPTACIÓN
// ================================================================

const crypto = require('crypto');

// Generar hash HMAC-SHA-512
function generarHMAC(payload, secret) {
    return crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
}

// Verificar firma HMAC
function verificarHMAC(payload, firmaRecibida, secret) {
    try {
        const firmaCalculada = generarHMAC(payload, secret);
        return crypto.timingSafeEqual(
            Buffer.from(firmaCalculada),
            Buffer.from(firmaRecibida)
        );
    } catch (error) {
        return false;
    }
}

// Generar ID único
function generarId(prefix = '') {
    const id = crypto.randomUUID();
    return prefix ? `${prefix}-${id}` : id;
}

// Generar código aleatorio (para invitaciones)
function generarCodigo(prefix = 'SAR', length = 6) {
    const random = crypto.randomBytes(length).toString('hex').toUpperCase().slice(0, length);
    return `${prefix}-${random}`;
}

// Encriptar datos (para webhooks)
function encriptarDatos(data, secret) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encrypted,
        tag: tag.toString('hex')
    };
}

// Desencriptar datos
function desencriptarDatos(encryptedData, secret) {
    const { iv, encrypted, tag } = encryptedData;
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

module.exports = {
    generarHMAC,
    verificarHMAC,
    generarId,
    generarCodigo,
    encriptarDatos,
    desencriptarDatos
};