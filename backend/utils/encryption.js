// ================================================================
// UTILS/ENCRYPTION.JS — Csariel's
// Cifrado AES-256-GCM, IDs y códigos aleatorios.
// NO usar para verificar IPN de NOWPayments: para eso está
// utils/nowpayments-sig.js (llaves ordenadas + timing-safe).
// ================================================================

'use strict';

const crypto = require('crypto');

// ================================================================
// IDs Y CÓDIGOS
// ================================================================

function generarId(prefijo = '') {
    const id = crypto.randomUUID();
    return prefijo ? `${prefijo}-${id}` : id;
}

function generarCodigo(prefijo = 'SAR', longitud = 6) {
    if (!Number.isInteger(longitud) || longitud < 4 || longitud > 64) {
        throw new Error('La longitud del código debe estar entre 4 y 64 caracteres');
    }
    const aleatorio = crypto
        .randomBytes(Math.ceil(longitud / 2))
        .toString('hex')
        .toUpperCase()
        .slice(0, longitud);
    return `${prefijo}-${aleatorio}`;
}

// ================================================================
// AES-256-GCM
// La clave debe ser 64 caracteres hex (32 bytes).
// ================================================================

function obtenerClaveAES(secret) {
    if (!secret || typeof secret !== 'string') {
        throw new Error('Encryption secret no configurado');
    }
    if (!/^[0-9a-f]{64}$/i.test(secret)) {
        throw new Error('El secret AES-256 debe ser exactamente 64 caracteres hexadecimales (32 bytes)');
    }
    return Buffer.from(secret, 'hex');
}

function encriptarDatos(datos, secret) {
    const clave = obtenerClaveAES(secret);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', clave, iv);
    const texto = JSON.stringify(datos);

    let cifrado = cipher.update(texto, 'utf8', 'hex');
    cifrado += cipher.final('hex');

    return {
        iv: iv.toString('hex'),
        encrypted: cifrado,
        tag: cipher.getAuthTag().toString('hex')
    };
}

function desencriptarDatos(datosCifrados, secret) {
    if (!datosCifrados || typeof datosCifrados !== 'object') {
        throw new Error('Datos cifrados inválidos');
    }

    const { iv, encrypted, tag } = datosCifrados;
    if (!iv || !encrypted || !tag) {
        throw new Error('Faltan campos requeridos para desencriptar');
    }

    const clave = obtenerClaveAES(secret);
    const ivBuf = Buffer.from(iv, 'hex');
    const tagBuf = Buffer.from(tag, 'hex');

    if (ivBuf.length !== 12) throw new Error('IV inválido');
    if (tagBuf.length !== 16) throw new Error('Auth tag inválido');

    const decipher = crypto.createDecipheriv('aes-256-gcm', clave, ivBuf);
    decipher.setAuthTag(tagBuf);

    let texto = decipher.update(encrypted, 'hex', 'utf8');
    texto += decipher.final('utf8');

    return JSON.parse(texto);
}

module.exports = {
    generarId,
    generarCodigo,
    encriptarDatos,
    desencriptarDatos
};