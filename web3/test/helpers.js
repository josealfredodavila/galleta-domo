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

// ================================================================
// TIPO EIP-712 PARA VENTAS DEL MURO P2P
// ================================================================
// Debe coincidir EXACTAMENTE con VENTA_TYPEHASH del contrato:
//   "Venta(address vendedor,address comprador,uint256 monto,uint256 nonce,uint256 deadline)"
//
// ⚠️  A diferencia de Claim/Quemar, esta firma la genera el VENDEDOR
// (no el backend). Por eso firmarVenta recibirá como `signer` al
// vendedor, y el contrato validará `firmante == vendedor`.
// ================================================================

const VENTA_TYPE = {
    Venta: [
        { name: 'vendedor',  type: 'address' },
        { name: 'comprador', type: 'address' },
        { name: 'monto',     type: 'uint256' },
        { name: 'nonce',     type: 'uint256' },
        { name: 'deadline',  type: 'uint256' }
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

    // signTypedData firma EIP-712
    return await signer.signTypedData(domain, CLAIM_TYPE, value);
}

// ================================================================
// FIRMAR VENTA (para venderEnMuro)
// ================================================================
// ⚠️  El `signer` que se pasa DEBE ser el VENDEDOR, no el backend.
// El contrato valida que `firmante == vendedor`.
// ================================================================

async function firmarVenta(signer, { chainId, verifyingContract, vendedor, comprador, monto, nonce, deadline }) {
    const domain = {
        ...DOMAIN_TOKEN,
        chainId,
        verifyingContract
    };

    const value = {
        vendedor,
        comprador,
        monto,
        nonce,
        deadline
    };

    return await signer.signTypedData(domain, VENTA_TYPE, value);
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
    VENTA_TYPE,
    QUEMAR_TYPE,
    firmarClaim,
    firmarVenta,
    firmarQuemar,
    deployToken,
    deployNFT,
    avanzarTiempo,
    obtenerTimestamp,
    deadlinePorDefecto
};