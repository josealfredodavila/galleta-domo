// ================================================================
// VERIFY - CSARIEL'S WEB3
// ================================================================
// Verifica los contratos en PolygonScan (mainnet o Amoy).
//
// Uso:
//   npx hardhat run scripts/verify.js --network amoy
//   npx hardhat run scripts/verify.js --network polygon
//
// Lee las direcciones desde deployments.json.
// ================================================================

const { run, network } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
    const archivo = path.join(__dirname, '..', 'deployments.json');

    if (!fs.existsSync(archivo)) {
        throw new Error('No existe deployments.json. Corre deploy.js primero.');
    }

    const deployments = JSON.parse(fs.readFileSync(archivo, 'utf8'));

    if (!deployments[network.name]) {
        throw new Error(`No hay deployments para "${network.name}".`);
    }

    const data = deployments[network.name];
    const tokenAddr = data.contratos.CsarielsToken.implementation;
    const nftAddr = data.contratos.CsarielsNFT.implementation;

    console.log(`\n🔍 Verificando contratos en ${network.name}...\n`);

    // Verificar Token
    console.log(`Verificando CsarielsToken en ${tokenAddr}...`);
    try {
        await run('verify:verify', {
            address: tokenAddr,
            constructorArguments: []
        });
        console.log('✅ CsarielsToken verificado\n');
    } catch (e) {
        if (e.message.includes('Already Verified')) {
            console.log('ℹ️  CsarielsToken ya estaba verificado\n');
        } else {
            console.error('❌ Error verificando CsarielsToken:', e.message, '\n');
        }
    }

    // Verificar NFT
    console.log(`Verificando CsarielsNFT en ${nftAddr}...`);
    try {
        await run('verify:verify', {
            address: nftAddr,
            constructorArguments: []
        });
        console.log('✅ CsarielsNFT verificado\n');
    } catch (e) {
        if (e.message.includes('Already Verified')) {
            console.log('ℹ️  CsarielsNFT ya estaba verificado\n');
        } else {
            console.error('❌ Error verificando CsarielsNFT:', e.message, '\n');
        }
    }

    console.log('✅ Verificación completada\n');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });