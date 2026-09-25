// ================================================================
// HELPERS COMPARTIDOS PARA TESTS
// ================================================================
// Funciones reutilizables por CsarielsToken.test.js y
// CsarielsNFT.test.js.
// ================================================================

const { ethers, upgrades } = require('hardhat');

// ================================================================
// DOMINIOS EIP-712
// ================================================================
// IMPORTANTE: estos strings deben coincidir EXACTAMENTE con los
// que el contrato usa en `_domainSeparatorV4()`.
//
// Token: name() = "Csariel's Token", version = "1"
// NFT:   name() = "Csariel's NFT",   version = "1"
// ================================================================

const DOMAIN_TOKEN = {
    name: "Csariel's Token",
    version: '1'
};

const DOMAIN_NFT = {
    name: "Csariel's NFT",
    version: '1'
};

const CLAIM_TYPE = {
    Claim: [
        { name: 'usuario', type: 'address' },
        { name: 'qrId', type: 'uint256' },
        { name: 'cantidad', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ]
};

const QUEMAR_TYPE = {
    Quemar: [
        { name: 'usuario', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
    ]
};

// ================================================================
// FIRMAR CLAIM (para reclamarTokens)
// ================================================================
// ⚠️ NOTA: la firma la genera el BACKEND (backendSigner), pero el
// `usuario` del claim es el destinatario (usuarioReceptor). El
// backend paga el gas y el contrato mintea a nombre del usuario.
// ================================================================

async function firmarClaim(signer, { chainId, verifyingContract, usuario, qrId, cantidad, nonce, deadline }) {
    const domain = {
        ...DOMAIN_TOKEN,
        chainId,
        verifyingContract
    };

    const value = {
        usuario,
        qrId,
        cantidad,
        nonce,
        deadline
    };

    return await signer.signTypedData(domain, CLAIM_TYPE, value);
}

// ================================================================
// FIRMAR QUEMAR (para quemarPorDomo)
// ================================================================

async function firmarQuemar(signer, { chainId, verifyingContract, usuario, tokenId, nonce, deadline }) {
    const domain = {
        ...DOMAIN_NFT,
        chainId,
        verifyingContract
    };

    const value = {
        usuario,
        tokenId,
        nonce,
        deadline
    };

    return await signer.signTypedData(domain, QUEMAR_TYPE, value);
}

// ================================================================
// DEPLOY DEL TOKEN CON PROXY
// ================================================================

async function deployToken({ admin, backendSigner, walletComisiones }) {
    const CsarielsToken = await ethers.getContractFactory('CsarielsToken');

    const token = await upgrades.deployProxy(
        CsarielsToken,
        [admin, backendSigner, walletComisiones],
        { kind: 'uups', initializer: 'initialize' }
    );

    await token.waitForDeployment();

    return token;
}

// ================================================================
// DEPLOY DEL NFT CON PROXY
// ================================================================

async function deployNFT({ admin, backendSigner, contratoToken, baseURI }) {
    const CsarielsNFT = await ethers.getContractFactory('CsarielsNFT');

    const nft = await upgrades.deployProxy(
        CsarielsNFT,
        [admin, backendSigner, contratoToken, baseURI],
        { kind: 'uups', initializer: 'initialize' }
    );

    await nft.waitForDeployment();

    return nft;
}

// ================================================================
// AVANZAR TIEMPO EN EL EVM
// ================================================================

async function avanzarTiempo(segundos) {
    await ethers.provider.send('evm_increaseTime', [segundos]);
    await ethers.provider.send('evm_mine', []);
}

async function obtenerTimestamp() {
    const bloque = await ethers.provider.getBlock('latest');
    return bloque.timestamp;
}

// ================================================================
// DEADLINE POR DEFECTO (5 minutos desde ahora)
// ================================================================

async function deadlinePorDefecto() {
    const ahora = await obtenerTimestamp();
    return ahora + 300;
}

module.exports = {
    DOMAIN_TOKEN,
    DOMAIN_NFT,
    CLAIM_TYPE,
    QUEMAR_TYPE,
    firmarClaim,
    firmarQuemar,
    deployToken,
    deployNFT,
    avanzarTiempo,
    obtenerTimestamp,
    deadlinePorDefecto
};