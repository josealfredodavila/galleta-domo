// ================================================================
// UPGRADE - CSARIEL'S WEB3
// ================================================================
// Script para actualizar los contratos existentes.
//
// El proxy UUPS mantiene:
//   - La misma dirección
//   - Los mismos datos (balances, NFTs, QRs)
//   - Solo cambia la lógica de la implementación
//
// Uso:
//   npx hardhat run scripts/upgrade.js --network amoy
//   npx hardhat run scripts/upgrade.js --network polygon
//
// Requiere que los contratos ya estén deployados.
// Lee las direcciones desde deployments.json.
// ================================================================

const { ethers, upgrades, network } = require('hardhat');
const fs = require('fs');
const path = require('path');

// ================================================================
// COLORES PARA CONSOLA
// ================================================================

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
    console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function header(title) {
    console.log('');
    log('════════════════════════════════════════════════════════', 'cyan');
    log(`  ${title}`, 'bright');
    log('════════════════════════════════════════════════════════', 'cyan');
    console.log('');
}

// ================================================================
// LEER DEPLOYMENTS.JSON
// ================================================================

function leerDeployments() {
    const archivo = path.join(__dirname, '..', 'deployments.json');

    if (!fs.existsSync(archivo)) {
        throw new Error(
            'No existe deployments.json. Primero corre deploy.js.'
        );
    }

    const deployments = JSON.parse(fs.readFileSync(archivo, 'utf8'));

    if (!deployments[network.name]) {
        throw new Error(
            `No hay deployments para la red "${network.name}". ` +
            `Corre primero: npx hardhat run scripts/deploy.js --network ${network.name}`
        );
    }

    return deployments[network.name];
}

// ================================================================
// SELECCIONAR CONTRATO A ACTUALIZAR
// ================================================================
// Lee el argumento de la línea de comandos:
//   npx hardhat run scripts/upgrade.js --network amoy --token
//   npx hardhat run scripts/upgrade.js --network amoy --nft
//
// Si no se especifica, por defecto actualiza ambos.
// ================================================================

function seleccionarContratos() {
    const args = process.argv.slice(2);

    const actualizarToken = args.includes('--token') || args.length === 2;
    const actualizarNFT = args.includes('--nft') || args.length === 2;

    // Si no hay argumentos específicos, actualizar ambos
    if (!actualizarToken && !actualizarNFT) {
        return { token: true, nft: true };
    }

    return {
        token: actualizarToken,
        nft: actualizarNFT
    };
}

// ================================================================
// ACTUALIZAR TOKEN
// ================================================================

async function actualizarToken(proxyAddress) {
    header('Actualizando CsarielsToken');

    log(`📦 Dirección del proxy: ${proxyAddress}`, 'cyan');
    log('');

    const CsarielsToken = await ethers.getContractFactory('CsarielsToken');

    log('⏳ Preparando upgrade...', 'yellow');
    log('');

    const tokenActualizado = await upgrades.upgradeProxy(
        proxyAddress,
        CsarielsToken,
        {
            kind: 'uups',
            timeout: 120000
        }
    );

    await tokenActualizado.waitForDeployment();

    const nuevaImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    log('✅ CsarielsToken actualizado', 'green');
    log(`   Proxy (sin cambios):     ${proxyAddress}`, 'cyan');
    log(`   Nueva implementación:    ${nuevaImpl}`, 'magenta');
    log('');

    // Verificar versión
    const version = await tokenActualizado.version();
    log(`   Versión: ${version}`, 'cyan');
    log('');

    return nuevaImpl;
}

// ================================================================
// ACTUALIZAR NFT
// ================================================================

async function actualizarNFT(proxyAddress) {
    header('Actualizando CsarielsNFT');

    log(`📦 Dirección del proxy: ${proxyAddress}`, 'cyan');
    log('');

    const CsarielsNFT = await ethers.getContractFactory('CsarielsNFT');

    log('⏳ Preparando upgrade...', 'yellow');
    log('');

    const nftActualizado = await upgrades.upgradeProxy(
        proxyAddress,
        CsarielsNFT,
        {
            kind: 'uups',
            timeout: 120000
        }
    );

    await nftActualizado.waitForDeployment();

    const nuevaImpl = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    log('✅ CsarielsNFT actualizado', 'green');
    log(`   Proxy (sin cambios):     ${proxyAddress}`, 'cyan');
    log(`   Nueva implementación:    ${nuevaImpl}`, 'magenta');
    log('');

    // Verificar versión
    const version = await nftActualizado.version();
    log(`   Versión: ${version}`, 'cyan');
    log('');

    return nuevaImpl;
}

// ================================================================
// ACTUALIZAR DEPLOYMENTS.JSON
// ================================================================

function actualizarDeployments(red, tokenImpl, nftImpl) {
    const archivo = path.join(__dirname, '..', 'deployments.json');
    const deployments = JSON.parse(fs.readFileSync(archivo, 'utf8'));

    if (!deployments[red]) {
        deployments[red] = { historial: [] };
    }

    if (!deployments[red].historial) {
        deployments[red].historial = [];
    }

    const entrada = {
        fecha: new Date().toISOString(),
        token_implementation: tokenImpl || null,
        nft_implementation: nftImpl || null,
        upgrade_number: deployments[red].historial.length + 1
    };

    deployments[red].historial.push(entrada);

    if (tokenImpl) {
        deployments[red].contratos.CsarielsToken.implementation = tokenImpl;
    }

    if (nftImpl) {
        deployments[red].contratos.CsarielsNFT.implementation = nftImpl;
    }

    fs.writeFileSync(
        archivo,
        JSON.stringify(deployments, null, 2),
        'utf8'
    );

    log(`💾 Historial de upgrades guardado`, 'green');
    log(`   Entrada #${entrada.upgrade_number}`, 'cyan');
    log('');
}

// ================================================================
// MAIN
// ================================================================

async function main() {
    header('UPGRADE DE CSARIEL\'S WEB3');

    // ----------------------------------------------------------------
    // 1. LEER DEPLOYMENTS
    // ----------------------------------------------------------------
    const deployments = leerDeployments();

    log(`🌐 Red: ${network.name}`, 'bright');
    log('');

    // ----------------------------------------------------------------
    // 2. SELECCIONAR CONTRATOS A ACTUALIZAR
    // ----------------------------------------------------------------
    const seleccion = seleccionarContratos();

    log('📋 Contratos a actualizar:', 'bright');
    log(`   Token:  ${seleccion.token ? 'SÍ' : 'no'}`, 'cyan');
    log(`   NFT:    ${seleccion.nft ? 'SÍ' : 'no'}`, 'cyan');
    log('');

    // ----------------------------------------------------------------
    // 3. VERIFICAR DEPLOYER
    // ----------------------------------------------------------------
    const [deployer] = await ethers.getSigners();
    log(`🔑 Deployer: ${deployer.address}`, 'bright');

    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceEther = ethers.formatEther(balance);

    log(`   Balance:  ${balanceEther} MATIC`, 'cyan');

    if (Number(balanceEther) < 0.1) {
        log('');
        log('⚠️  Balance bajo de MATIC. El upgrade puede fallar.', 'yellow');
        log('');
    }

    log('');

    // ----------------------------------------------------------------
    // 4. ADVERTENCIA
    // ----------------------------------------------------------------
    log('⚠️  ADVERTENCIA:', 'yellow');
    log('   El upgrade reemplaza la lógica del contrato.', 'yellow');
    log('   Los datos se preservan (balances, NFTs, QRs).', 'yellow');
    log('   Asegúrate de haber testeado el nuevo código localmente.', 'yellow');
    log('   No se puede revertir fácilmente (hay que hacer otro upgrade).', 'yellow');
    log('');

    // ----------------------------------------------------------------
    // 5. EJECUTAR UPGRADES
    // ----------------------------------------------------------------
    let tokenImpl = null;
    let nftImpl = null;

    if (seleccion.token) {
        try {
            tokenImpl = await actualizarToken(
                deployments.contratos.CsarielsToken.proxy
            );
        } catch (error) {
            log(`❌ Error actualizando Token: ${error.message}`, 'red');
            throw error;
        }
    }

    if (seleccion.nft) {
        try {
            nftImpl = await actualizarNFT(
                deployments.contratos.CsarielsNFT.proxy
            );
        } catch (error) {
            log(`❌ Error actualizando NFT: ${error.message}`, 'red');
            throw error;
        }
    }

    // ----------------------------------------------------------------
    // 6. GUARDAR HISTORIAL
    // ----------------------------------------------------------------
    header('Guardando Historial');

    actualizarDeployments(network.name, tokenImpl, nftImpl);

    // ----------------------------------------------------------------
    // 7. RESUMEN FINAL
    // ----------------------------------------------------------------
    header('✅ UPGRADE COMPLETADO');

    log('🎉 Contratos actualizados exitosamente', 'green');
    log('');
    log('📋 RESUMEN:', 'bright');
    log('');

    if (tokenImpl) {
        log('   CsarielsToken:', 'bright');
        log(`      Proxy:              ${deployments.contratos.CsarielsToken.proxy}`, 'cyan');
        log(`      Nueva implementación: ${tokenImpl}`, 'magenta');
        log('');
    }

    if (nftImpl) {
        log('   CsarielsNFT:', 'bright');
        log(`      Proxy:              ${deployments.contratos.CsarielsNFT.proxy}`, 'cyan');
        log(`      Nueva implementación: ${nftImpl}`, 'magenta');
        log('');
    }

    log('📝 PRÓXIMOS PASOS:', 'bright');
    log('');
    log('   1. Verifica los contratos en PolygonScan:', 'yellow');

    if (network.name === 'polygon') {
        if (tokenImpl) {
            log(`      https://polygonscan.com/address/${tokenImpl}`, 'cyan');
        }
        if (nftImpl) {
            log(`      https://polygonscan.com/address/${nftImpl}`, 'cyan');
        }
    } else if (network.name === 'amoy') {
        if (tokenImpl) {
            log(`      https://amoy.polygonscan.com/address/${tokenImpl}`, 'cyan');
        }
        if (nftImpl) {
            log(`      https://amoy.polygonscan.com/address/${nftImpl}`, 'cyan');
        }
    }

    log('');
    log('   2. Prueba las funciones nuevas', 'yellow');
    log('   3. Actualiza las direcciones en tu backend si es necesario', 'yellow');
    log('');

    log('════════════════════════════════════════════════════════', 'cyan');
    log('  ✅ UPGRADE EXITOSO', 'green');
    log('════════════════════════════════════════════════════════', 'cyan');
    console.log('');
}

// ================================================================
// EJECUCIÓN
// ================================================================

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('');
        console.error(`${COLORS.red}❌ ERROR:${COLORS.reset}`, error);
        console.error('');
        process.exit(1);
    });