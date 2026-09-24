// ================================================================
// DEPLOY - CSARIEL'S WEB3
// ================================================================
// Script de deploy de los contratos a Polygon (mainnet o testnet).
//
// Uso:
//   npx hardhat run scripts/deploy.js --network amoy
//   npx hardhat run scripts/deploy.js --network polygon
//
// Requiere que las variables de entorno estén configuradas en .env:
//   - ADMIN_PRIVATE_KEY
//   - ADMIN_ADDRESS
//   - BACKEND_SIGNER_ADDRESS
//   - WALLET_COMISIONES_ADDRESS
//   - BASE_URI_NFT
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
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ================================================================

function validarEntorno() {
    const requeridas = [
        'ADMIN_PRIVATE_KEY',
        'ADMIN_ADDRESS',
        'BACKEND_SIGNER_ADDRESS',
        'WALLET_COMISIONES_ADDRESS',
        'BASE_URI_NFT'
    ];

    const faltantes = [];

    for (const variable of requeridas) {
        if (!process.env[variable] || process.env[variable] === '') {
            faltantes.push(variable);
        }
    }

    if (faltantes.length > 0) {
        log('❌ Faltan variables de entorno en .env:', 'red');
        for (const variable of faltantes) {
            log(`   - ${variable}`, 'red');
        }
        log('');
        log('Copia .env.example a .env y rellena los valores:', 'yellow');
        log('   cp .env.example .env', 'cyan');
        throw new Error('Variables de entorno incompletas');
    }

    // Validar formato de direcciones
    const direcciones = [
        'ADMIN_ADDRESS',
        'BACKEND_SIGNER_ADDRESS',
        'WALLET_COMISIONES_ADDRESS'
    ];

    for (const variable of direcciones) {
        const valor = process.env[variable];
        if (!ethers.isAddress(valor)) {
            throw new Error(`${variable} no es una dirección válida: ${valor}`);
        }
    }

    log('✅ Variables de entorno validadas', 'green');
    log(`   Admin:               ${process.env.ADMIN_ADDRESS}`, 'cyan');
    log(`   Backend Signer:      ${process.env.BACKEND_SIGNER_ADDRESS}`, 'cyan');
    log(`   Wallet Comisiones:   ${process.env.WALLET_COMISIONES_ADDRESS}`, 'cyan');
    log(`   Base URI:            ${process.env.BASE_URI_NFT}`, 'cyan');
    log('');
}

// ================================================================
// GUARDAR DIRECCIONES EN deployments.json
// ================================================================

function guardarDeployments(data) {
    const archivo = path.join(__dirname, '..', 'deployments.json');

    let deployments = {};

    // Si ya existe, leerlo
    if (fs.existsSync(archivo)) {
        try {
            deployments = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        } catch (e) {
            deployments = {};
        }
    }

    // Agregar datos de esta red
    deployments[network.name] = data;

    fs.writeFileSync(
        archivo,
        JSON.stringify(deployments, null, 2),
        'utf8'
    );

    log(`💾 Direcciones guardadas en deployments.json`, 'green');
    log(`   Sección: ${network.name}`, 'cyan');
    log('');
}

// ================================================================
// MAIN
// ================================================================

async function main() {
    header('DEPLOY DE CSARIEL\'S WEB3');

    // ----------------------------------------------------------------
    // 1. VALIDAR ENTORNO
    // ----------------------------------------------------------------
    validarEntorno();

    // ----------------------------------------------------------------
    // 2. OBTENER DEPLOYER
    // ----------------------------------------------------------------
    const [deployer] = await ethers.getSigners();

    log('🔑 Deployer:', 'bright');
    log(`   Dirección: ${deployer.address}`, 'cyan');

    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceEther = ethers.formatEther(balance);

    log(`   Balance:   ${balanceEther} MATIC`, 'cyan');

    if (Number(balanceEther) < 0.5) {
        log('');
        log('⚠️  Balance bajo de MATIC. Necesitas al menos 0.5 MATIC para el deploy.', 'yellow');
        log('   Si estás en Amoy (testnet), pide MATIC gratis en:', 'yellow');
        log('   https://faucet.polygon.technology/', 'cyan');
        log('');
    }

    log('');
    log(`🌐 Red: ${network.name} (chainId: ${network.config.chainId})`, 'bright');
    log('');

    // ----------------------------------------------------------------
    // 3. DEPLOY DEL TOKEN (CsarielsToken)
    // ----------------------------------------------------------------
    header('1. Deployando CsarielsToken (ES.TOKS)');

    const CsarielsToken = await ethers.getContractFactory('CsarielsToken');

    log('📦 Contrato cargado', 'green');
    log('⏳ Deployando proxy + implementación...', 'yellow');
    log('');

    const token = await upgrades.deployProxy(
        CsarielsToken,
        [
            process.env.ADMIN_ADDRESS,
            process.env.BACKEND_SIGNER_ADDRESS,
            process.env.WALLET_COMISIONES_ADDRESS
        ],
        {
            kind: 'uups',
            initializer: 'initialize',
            timeout: 120000
        }
    );

    await token.waitForDeployment();

    const tokenProxyAddress = await token.getAddress();
    const tokenImplAddress = await upgrades.erc1967.getImplementationAddress(tokenProxyAddress);

    log('✅ CsarielsToken deployado', 'green');
    log(`   Proxy (público):         ${tokenProxyAddress}`, 'cyan');
    log(`   Implementación (lógica): ${tokenImplAddress}`, 'magenta');
    log('');

    // ----------------------------------------------------------------
    // 4. DEPLOY DEL NFT (CsarielsNFT)
    // ----------------------------------------------------------------
    header('2. Deployando CsarielsNFT');

    const CsarielsNFT = await ethers.getContractFactory('CsarielsNFT');

    log('📦 Contrato cargado', 'green');
    log('⏳ Deployando proxy + implementación...', 'yellow');
    log('');

    const nft = await upgrades.deployProxy(
        CsarielsNFT,
        [
            process.env.ADMIN_ADDRESS,
            process.env.BACKEND_SIGNER_ADDRESS,
            tokenProxyAddress,
            process.env.BASE_URI_NFT
        ],
        {
            kind: 'uups',
            initializer: 'initialize',
            timeout: 120000
        }
    );

    await nft.waitForDeployment();

    const nftProxyAddress = await nft.getAddress();
    const nftImplAddress = await upgrades.erc1967.getImplementationAddress(nftProxyAddress);

    log('✅ CsarielsNFT deployado', 'green');
    log(`   Proxy (público):         ${nftProxyAddress}`, 'cyan');
    log(`   Implementación (lógica): ${nftImplAddress}`, 'magenta');
    log('');

    // ----------------------------------------------------------------
    // 5. AUTORIZAR AL NFT EN EL TOKEN
    // ----------------------------------------------------------------
    header('3. Autorizando al NFT en el Token');

    log('⏳ Llamando a setContratoNFT...', 'yellow');
    log('');

    const tx = await token.setContratoNFT(nftProxyAddress);
    log(`   TX enviada: ${tx.hash}`, 'cyan');

    await tx.wait();

    log('✅ NFT autorizado en el Token', 'green');
    log(`   El contrato NFT puede quemar ES.TOKS`, 'cyan');
    log('');

    // ----------------------------------------------------------------
    // 6. VERIFICACIÓN FINAL
    // ----------------------------------------------------------------
    header('4. Verificación Final');

    // Verificar configuración del token
    const tokenName = await token.name();
    const tokenSymbol = await token.symbol();
    const tokenMaxSupply = await token.MAX_SUPPLY();
    const tokenContratoNFT = await token.contratoNFT();

    log('📊 CsarielsToken:', 'bright');
    log(`   Nombre:        ${tokenName}`, 'cyan');
    log(`   Símbolo:       ${tokenSymbol}`, 'cyan');
    log(`   Supply máximo: ${ethers.formatEther(tokenMaxSupply)} ES.TOKS`, 'cyan');
    log(`   Contrato NFT:  ${tokenContratoNFT}`, 'cyan');
    log('');

    // Verificar configuración del NFT
    const nftName = await nft.name();
    const nftSymbol = await nft.symbol();
    const nftToken = await nft.contratoToken();
    const nftBackend = await nft.backendSigner();

    log('🖼️  CsarielsNFT:', 'bright');
    log(`   Nombre:        ${nftName}`, 'cyan');
    log(`   Símbolo:       ${nftSymbol}`, 'cyan');
    log(`   Contrato Token:${nftToken}`, 'cyan');
    log(`   Backend Signer:${nftBackend}`, 'cyan');
    log('');

    // ----------------------------------------------------------------
    // 7. GUARDAR DIRECCIONES
    // ----------------------------------------------------------------
    header('5. Guardando Direcciones');

    const deploymentData = {
        network: network.name,
        chainId: network.config.chainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contratos: {
            CsarielsToken: {
                proxy: tokenProxyAddress,
                implementation: tokenImplAddress,
                version: '1.0.0'
            },
            CsarielsNFT: {
                proxy: nftProxyAddress,
                implementation: nftImplAddress,
                version: '1.0.0'
            }
        },
        configuracion: {
            admin: process.env.ADMIN_ADDRESS,
            backendSigner: process.env.BACKEND_SIGNER_ADDRESS,
            walletComisiones: process.env.WALLET_COMISIONES_ADDRESS,
            baseURINFT: process.env.BASE_URI_NFT
        }
    };

    guardarDeployments(deploymentData);

    // ----------------------------------------------------------------
    // 8. RESUMEN FINAL
    // ----------------------------------------------------------------
    header('✅ DEPLOY COMPLETADO');

    log('🎉 Contratos deployados exitosamente', 'green');
    log('');
    log('📋 RESUMEN:', 'bright');
    log('');
    log('   CsarielsToken:', 'bright');
    log(`      ${tokenProxyAddress}`, 'cyan');
    log('');
    log('   CsarielsNFT:', 'bright');
    log(`      ${nftProxyAddress}`, 'cyan');
    log('');
    log('🌐 Ver en el explorador:', 'bright');

    if (network.name === 'polygon') {
        log(`   Token: https://polygonscan.com/address/${tokenProxyAddress}`, 'cyan');
        log(`   NFT:   https://polygonscan.com/address/${nftProxyAddress}`, 'cyan');
    } else if (network.name === 'amoy') {
        log(`   Token: https://amoy.polygonscan.com/address/${tokenProxyAddress}`, 'cyan');
        log(`   NFT:   https://amoy.polygonscan.com/address/${nftProxyAddress}`, 'cyan');
    }
    log('');

    // ----------------------------------------------------------------
    // 9. INSTRUCCIONES SIGUIENTES
    // ----------------------------------------------------------------
    log('📝 PRÓXIMOS PASOS:', 'bright');
    log('');
    log('   1. Copia las direcciones de arriba', 'yellow');
    log('   2. Agrégalas a tu backend (Railway) en las variables:', 'yellow');
    log(`      CSARIELS_TOKEN_ADDRESS=${tokenProxyAddress}`, 'cyan');
    log(`      CSARIELS_NFT_ADDRESS=${nftProxyAddress}`, 'cyan');
    log('   3. Actualiza tu archivo .env local si lo necesitas', 'yellow');
    log('   4. Verifica los contratos en PolygonScan (opcional):', 'yellow');
    log(`      npx hardhat run scripts/verify.js --network ${network.name}`, 'cyan');
    log('');

    log('════════════════════════════════════════════════════════', 'cyan');
    log('  ✅ TODO LISTO', 'green');
    log('════════════════════════════════════════════════════════', 'cyan');
    console.log('');

    return {
        token: tokenProxyAddress,
        nft: nftProxyAddress
    };
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