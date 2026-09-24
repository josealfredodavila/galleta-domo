// ================================================================
// HARDHAT CONFIG - CSARIEL'S WEB3
// ================================================================
// Configuración de Hardhat para compilar, testear y deployar los
// contratos de Csariel's Ecosystem.
//
// Redes soportadas:
//   - hardhat       (local, para tests)
//   - amoy          (testnet de Polygon, para pruebas)
//   - polygon       (mainnet de Polygon, para producción)
//   - localhost     (nodo local persistente)
// ================================================================

require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-gas-reporter');
require('dotenv').config();

// ================================================================
// VARIABLES DE ENTORNO
// ================================================================
// Estas se leen desde el archivo .env (que NO se sube a git).
//
// Si no están configuradas, el deploy en mainnet falla con error.
// Los tests locales no las necesitan.
// ================================================================

const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY || '';
const BACKEND_SIGNER_PRIVATE_KEY = process.env.BACKEND_SIGNER_PRIVATE_KEY || '';
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || '';

// ================================================================
// VALIDACIÓN DE VARIABLES
// ================================================================
// Si alguien intenta deployar sin configurar las variables, se lo
// advertimos con un mensaje claro (aunque no detenemos el arranque
// porque los tests locales no las necesitan).
// ================================================================

if (!ADMIN_PRIVATE_KEY) {
    console.warn('⚠️  ADMIN_PRIVATE_KEY no configurada. Los deploys fallarán.');
}

if (!BACKEND_SIGNER_PRIVATE_KEY) {
    console.warn('⚠️  BACKEND_SIGNER_PRIVATE_KEY no configurada. Los deploys fallarán.');
}

if (!POLYGONSCAN_API_KEY) {
    console.warn('⚠️  POLYGONSCAN_API_KEY no configurada. La verificación fallará.');
}

// ================================================================
// CONFIGURACIÓN PRINCIPAL
// ================================================================

module.exports = {
    // ============================================================
    // SOLIDITY
    // ============================================================
    solidity: {
        version: '0.8.20',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            viaIR: false,
            evmVersion: 'paris',
        },
    },

    // ============================================================
    // REDES
    // ============================================================
    networks: {
        // --------------------------------------------------------
        // Hardhat local (para tests)
        // No necesita configuración especial.
        // --------------------------------------------------------
        hardhat: {
            chainId: 31337,
            // Los tests pueden necesitar muchos bloques
            allowUnlimitedContractSize: false,
            // Minar bloques al instante (útil para tests)
            mining: {
                auto: true,
                interval: 0,
            },
        },

        // --------------------------------------------------------
        // Nodo local persistente (opcional)
        // Levanta con: npx hardhat node
        // --------------------------------------------------------
        localhost: {
            url: 'http://127.0.0.1:8545',
            chainId: 31337,
        },

        // --------------------------------------------------------
        // Amoy Testnet (testnet oficial de Polygon)
        // Faucet: https://faucet.polygon.technology/
        // RPC: https://rpc-amoy.polygon.technology/
        // --------------------------------------------------------
        amoy: {
            url: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology/',
            chainId: 80002,
            accounts: ADMIN_PRIVATE_KEY ? [ADMIN_PRIVATE_KEY] : [],
            gasPrice: 'auto',
            gas: 'auto',
        },

        // --------------------------------------------------------
        // Polygon Mainnet (producción)
        // RPC público: https://polygon-rpc.com/
        // RPC alternativo: https://polygon.llamarpc.com
        // --------------------------------------------------------
        polygon: {
            url: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
            chainId: 137,
            accounts: ADMIN_PRIVATE_KEY ? [ADMIN_PRIVATE_KEY] : [],
            gasPrice: 'auto',
            gas: 'auto',
            // Polygon puede tener picos de gas; timeout más largo
            timeout: 120000,
        },
    },

    // ============================================================
    // VERIFICACIÓN DE CONTRATOS
    // ============================================================
    // Después del deploy, verificamos el código en PolygonScan para
    // que sea público y auditable.
    // ============================================================
    etherscan: {
        apiKey: {
            polygon: POLYGONSCAN_API_KEY,
            polygonAmoy: POLYGONSCAN_API_KEY,
        },
        customChains: [
            {
                network: 'polygonAmoy',
                chainId: 80002,
                urls: {
                    apiURL: 'https://api-amoy.polygonscan.com/api',
                    browserURL: 'https://amoy.polygonscan.com',
                },
            },
        ],
    },

    // ============================================================
    // GAS REPORTER
    // ============================================================
    // Muestra cuánto gas consume cada función al correr los tests.
    // Útil para optimizar costos.
    // ============================================================
    gasReporter: {
        enabled: process.env.REPORT_GAS === 'true',
        currency: 'USD',
        coinmarketcap: process.env.COINMARKETCAP_API_KEY || '',
        token: 'MATIC',
        gasPrice: 40, // gwei aproximados en Polygon
        showTimeSpent: true,
        showMethodSig: true,
    },

    // ============================================================
    // COBERTURA DE TESTS
    // ============================================================
    coverage: {
        exclude: [
            'contracts/mocks/**',
            'contracts/test/**',
        ],
    },

    // ============================================================
    // RUTAS
    // ============================================================
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },

    // ============================================================
    // MOCHA (tests)
    // ============================================================
    mocha: {
        timeout: 60000, // 60 segundos por test (los deploys son lentos)
    },

    // ============================================================
    // TYPE-CHAIN
    // ============================================================
    typechain: {
        outDir: 'typechain-types',
        target: 'ethers-v6',
    },
};