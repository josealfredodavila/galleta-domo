// ================================================================
// SERVICES/PAY/GEO/PAISES.JS
// CSARIEL'S PAY - MAPA DE PAÍSES SOPORTADOS
// ================================================================
// Define qué métodos de pago y qué proveedores están disponibles
// en cada país. Es data pura, sin lógica de negocio.
//
// Uso:
//   const { obtenerPais, proveedorParaMetodo } = require('./geo/paises');
//   const config = obtenerPais('MX');
//   const proveedor = proveedorParaMetodo('MX', 'spei'); // 'fintoc'
//
// Reglas:
//   - México es el único con SPEI (Fintoc solo opera en MX).
//   - Los 6 países tienen tarjeta (Stripe) y crypto (NOWPayments).
//   - Agregar un país = agregar una entrada aquí. Nada más.
//
// Para deshabilitar un país temporalmente:
//   - Cambiar `activo: false`. Queda documentado pero inoperante.
//
// Para deshabilitar un método en un país:
//   - Quitarlo de `metodos_disponibles`. El Core lo rechazará.
// ================================================================

'use strict';

// ================================================================
// MAPA DE PAÍSES
// ================================================================
// Estructura de cada país:
//   codigo_iso           -> Código ISO 3166-1 alpha-2 (uppercase)
//   nombre               -> Nombre para mostrar
//   moneda_local         -> Moneda de la operación local
//   minimo_crypto_usd    -> Monto mínimo por operación crypto (USD)
//   metodos_disponibles  -> Array de: 'tarjeta' | 'spei' | 'usdt' | 'usdc'
//   proveedores_habilitados -> Array de: 'stripe' | 'fintoc' | 'nowpayments'
//   activo               -> Si el país está operativo en Csariel's Pay
// ================================================================

const PAISES = {

    // ============================================================
    // MÉXICO
    // Único país con SPEI (vía Fintoc).
    // ============================================================
    MX: {
        codigo_iso: 'MX',
        nombre: 'México',
        moneda_local: 'MXN',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'spei',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'fintoc',
            'nowpayments'
        ],
        activo: true
    },

    // ============================================================
    // COLOMBIA
    // Sin SPEI. Fintoc no opera fuera de México.
    // ============================================================
    CO: {
        codigo_iso: 'CO',
        nombre: 'Colombia',
        moneda_local: 'COP',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'nowpayments'
        ],
        activo: true
    },

    // ============================================================
    // CHILE
    // ============================================================
    CL: {
        codigo_iso: 'CL',
        nombre: 'Chile',
        moneda_local: 'CLP',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'nowpayments'
        ],
        activo: true
    },

    // ============================================================
    // ARGENTINA
    // ============================================================
    AR: {
        codigo_iso: 'AR',
        nombre: 'Argentina',
        moneda_local: 'ARS',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'nowpayments'
        ],
        activo: true
    },

    // ============================================================
    // PERÚ
    // ============================================================
    PE: {
        codigo_iso: 'PE',
        nombre: 'Perú',
        moneda_local: 'PEN',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'nowpayments'
        ],
        activo: true
    },

    // ============================================================
    // ECUADOR
    // Usa USD como moneda local (Ecuador está dolarizado).
    // ============================================================
    EC: {
        codigo_iso: 'EC',
        nombre: 'Ecuador',
        moneda_local: 'USD',
        minimo_crypto_usd: 1,
        metodos_disponibles: [
            'tarjeta',
            'usdt',
            'usdc'
        ],
        proveedores_habilitados: [
            'stripe',
            'nowpayments'
        ],
        activo: true
    }

};

// ================================================================
// PAÍS POR DEFECTO
// ================================================================
// Si un usuario no tiene país declarado, se asume México.
// ================================================================

const PAIS_POR_DEFECTO = 'MX';

// ================================================================
// MÉTODOS VÁLIDOS (a nivel global)
// ================================================================
// El Core rechaza cualquier método que no esté aquí, antes incluso
// de consultar el país.
// ================================================================

const METODOS_VALIDOS_GLOBAL = [
    'tarjeta',
    'spei',
    'usdt',
    'usdc'
];

// ================================================================
// PROVEEDORES VÁLIDOS (a nivel global)
// ================================================================

const PROVEEDORES_VALIDOS_GLOBAL = [
    'stripe',
    'fintoc',
    'nowpayments'
];

// ================================================================
// MAPEO MÉTODO -> PROVEEDOR
// ================================================================
// Cada método tiene un único proveedor asociado.
// Si en el futuro un método puede usar más de un proveedor
// (por ejemplo, tarjeta vía Stripe o vía MercadoPago), esta
// estructura cambia a un array y el Core elige por prioridad.
// ================================================================

const METODO_A_PROVEEDOR = {
    'tarjeta': 'stripe',
    'spei': 'fintoc',
    'usdt': 'nowpayments',
    'usdc': 'nowpayments'
};

// ================================================================
// HELPERS
// ================================================================

/**
 * Normaliza un código de país (uppercase, trim).
 * Devuelve null si no es válido.
 */
function normalizarCodigoPais(codigo) {
    if (!codigo || typeof codigo !== 'string') {
        return null;
    }

    const limpio = codigo.trim().toUpperCase();

    if (limpio.length !== 2) {
        return null;
    }

    return limpio;
}

/**
 * Obtiene la configuración completa de un país.
 * Devuelve null si el país no existe o está inactivo.
 */
function obtenerPais(codigo) {
    const codigoNormalizado = normalizarCodigoPais(codigo);

    if (!codigoNormalizado) {
        return null;
    }

    const pais = PAISES[codigoNormalizado];

    if (!pais) {
        return null;
    }

    if (!pais.activo) {
        return null;
    }

    return pais;
}

/**
 * Verifica si un país está soportado y activo.
 */
function esPaisSoportado(codigo) {
    return obtenerPais(codigo) !== null;
}

/**
 * Verifica si un método está disponible en un país dado.
 */
function metodoEstaPermitido(codigoPais, metodo) {
    if (!metodo || typeof metodo !== 'string') {
        return false;
    }

    if (!METODOS_VALIDOS_GLOBAL.includes(metodo)) {
        return false;
    }

    const pais = obtenerPais(codigoPais);

    if (!pais) {
        return false;
    }

    return pais.metodos_disponibles.includes(metodo);
}

/**
 * Verifica si un proveedor está habilitado en un país dado.
 */
function proveedorEstaHabilitado(codigoPais, proveedor) {
    if (!proveedor || typeof proveedor !== 'string') {
        return false;
    }

    if (!PROVEEDORES_VALIDOS_GLOBAL.includes(proveedor)) {
        return false;
    }

    const pais = obtenerPais(codigoPais);

    if (!pais) {
        return false;
    }

    return pais.proveedores_habilitados.includes(proveedor);
}

/**
 * Devuelve el proveedor correspondiente a un método en un país.
 *
 * Devuelve null si:
 *   - El país no está soportado.
 *   - El método no está permitido en ese país.
 *   - El método no tiene proveedor mapeado.
 *   - El proveedor del método no está habilitado en ese país
 *     (por ejemplo, spei en Colombia).
 */
function proveedorParaMetodo(codigoPais, metodo) {
    if (!metodoEstaPermitido(codigoPais, metodo)) {
        return null;
    }

    const proveedor = METODO_A_PROVEEDOR[metodo];

    if (!proveedor) {
        return null;
    }

    if (!proveedorEstaHabilitado(codigoPais, proveedor)) {
        return null;
    }

    return proveedor;
}

/**
 * Devuelve un objeto con la lista de métodos disponibles en un país,
 * con el proveedor asociado a cada uno.
 *
 * Útil para el frontend de "Pagar $350 MXN":
 *   [
 *     { metodo: 'tarjeta', proveedor: 'stripe' },
 *     { metodo: 'spei',    proveedor: 'fintoc' },
 *     { metodo: 'usdt',    proveedor: 'nowpayments' },
 *     { metodo: 'usdc',    proveedor: 'nowpayments' }
 *   ]
 */
function metodosDisponiblesConProveedor(codigoPais) {
    const pais = obtenerPais(codigoPais);

    if (!pais) {
        return [];
    }

    return pais.metodos_disponibles
        .map(function (metodo) {
            const proveedor = METODO_A_PROVEEDOR[metodo];
            return {
                metodo: metodo,
                proveedor: proveedor || null
            };
        })
        .filter(function (item) {
            return item.proveedor !== null;
        });
}

/**
 * Lista todos los países soportados y activos.
 */
function listarPaisesActivos() {
    return Object.keys(PAISES)
        .filter(function (codigo) {
            return PAISES[codigo].activo === true;
        })
        .map(function (codigo) {
            return PAISES[codigo];
        });
}

// ================================================================
// EXPORTACIONES
// ================================================================

module.exports = {
    // Constantes
    PAISES: PAISES,
    PAIS_POR_DEFECTO: PAIS_POR_DEFECTO,
    METODOS_VALIDOS_GLOBAL: METODOS_VALIDOS_GLOBAL,
    PROVEEDORES_VALIDOS_GLOBAL: PROVEEDORES_VALIDOS_GLOBAL,
    METODO_A_PROVEEDOR: METODO_A_PROVEEDOR,

    // Helpers
    normalizarCodigoPais: normalizarCodigoPais,
    obtenerPais: obtenerPais,
    esPaisSoportado: esPaisSoportado,
    metodoEstaPermitido: metodoEstaPermitido,
    proveedorEstaHabilitado: proveedorEstaHabilitado,
    proveedorParaMetodo: proveedorParaMetodo,
    metodosDisponiblesConProveedor: metodosDisponiblesConProveedor,
    listarPaisesActivos: listarPaisesActivos
};