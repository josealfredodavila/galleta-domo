// ================================================================
// TESTS - CSARIEL'S NFT
// ================================================================

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
    firmarClaim,
    firmarQuemar,
    deployToken,
    deployNFT,
    avanzarTiempo,
    obtenerTimestamp,
    deadlinePorDefecto
} = require('./helpers');

describe("CsarielsNFT", function () {
    let token, nft;
    let admin, backendSigner, walletComisiones, usuario1, usuario2, atacante;
    let chainId;

    const DOCE_TOKENS = ethers.parseEther('12');
    const UN_TOKEN = ethers.parseEther('1');
    const BASE_URI = 'https://galleta-domo-production.up.railway.app/nft/';

    // ============================================================
    // SETUP
    // ============================================================

    beforeEach(async function () {
        [admin, backendSigner, walletComisiones, usuario1, usuario2, atacante] = await ethers.getSigners();
        chainId = (await ethers.provider.getNetwork()).chainId;

        token = await deployToken({
            admin: admin.address,
            backendSigner: backendSigner.address,
            walletComisiones: walletComisiones.address
        });

        nft = await deployNFT({
            admin: admin.address,
            backendSigner: backendSigner.address,
            contratoToken: await token.getAddress(),
            baseURI: BASE_URI
        });

        // Autorizar al NFT para quemar tokens
        await token.connect(admin).setContratoNFT(await nft.getAddress());

        // Mintear 12 tokens a usuario1 (para poder canjear)
        const deadline = await deadlinePorDefecto();
        const firma = await firmarClaim(backendSigner, {
            chainId,
            verifyingContract: await token.getAddress(),
            usuario: usuario1.address,
            qrId: 5001,
            cantidad: DOCE_TOKENS,
            nonce: 0,
            deadline
        });
        await token.connect(usuario1).reclamarTokens(5001, DOCE_TOKENS, deadline, firma);
    });

    // ============================================================
    // DESPLIEGUE
    // ============================================================

    describe("Despliegue", function () {
        it("Nombre y símbolo correctos", async function () {
            expect(await nft.name()).to.equal("Csariel's NFT");
            expect(await nft.symbol()).to.equal('CSN');
        });

        it("baseURI configurado", async function () {
            expect(await nft.baseURI()).to.equal(BASE_URI);
        });

        it("contratoToken configurado", async function () {
            expect(await nft.contratoToken()).to.equal(await token.getAddress());
        });

        it("TOKENS_PARA_CANJE es 12 ES.TOKS", async function () {
            expect(await nft.TOKENS_PARA_CANJE()).to.equal(DOCE_TOKENS);
        });

        it("DIAS_VALIDEZ es 30 días", async function () {
            expect(await nft.DIAS_VALIDEZ()).to.equal(30);
        });
    });

    // ============================================================
    // CANJEAR POR TOKENS
    // ============================================================

    describe("canjearPorTokens", function () {
        it("Quema 12 ES.TOKS y mintea 1 NFT", async function () {
            await expect(
                nft.connect(usuario1).canjearPorTokens()
            ).to.emit(nft, 'NFTCanjeado');

            expect(await token.balanceOf(usuario1.address)).to.equal(0);
            expect(await nft.balanceOf(usuario1.address)).to.equal(1);
            expect(await nft.ownerOf(1)).to.equal(usuario1.address);
            expect(await nft.totalNFTsMinteados()).to.equal(1);
        });

        it("Rechaza si usuario no tiene 12 ES.TOKS", async function () {
            await expect(
                nft.connect(usuario2).canjearPorTokens()
            ).to.be.revertedWith('No tienes 12 ES.TOKS suficientes');
        });

        it("Guarda metadata correctamente", async function () {
            await nft.connect(usuario1).canjearPorTokens();

            const info = await nft.infoNFT(1);
            expect(info.propietarioOriginal).to.equal(usuario1.address);
            expect(info.fechaCanje).to.be.gt(0);
            expect(info.fechaExpiracion).to.be.gt(info.fechaCanje);
            expect(info.quemadoPorDomo).to.equal(false);
        });

        it("Falla si no está autorizado el NFT en el token", async function () {
            // Desautorizar
            await token.connect(admin).setContratoNFT(atacante.address);

            await expect(
                nft.connect(usuario1).canjearPorTokens()
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });
    });

    // ============================================================
    // QUEMAR POR DOMO
    // ============================================================

    describe("quemarPorDomo", function () {
        beforeEach(async function () {
            await nft.connect(usuario1).canjearPorTokens();
        });

        it("Quema el NFT con firma válida", async function () {
            const tokenId = 1;
            const deadline = await deadlinePorDefecto();
            const nonce = await nft.nonces(usuario1.address);

            const firma = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId,
                nonce,
                deadline
            });

            await expect(
                nft.connect(usuario1).quemarPorDomo(tokenId, deadline, firma)
            ).to.emit(nft, 'NFTQuemadoPorDomo');

            await expect(nft.ownerOf(tokenId)).to.be.reverted; // ya no existe
        });

        it("Rechaza si no eres dueño", async function () {
            const deadline = await deadlinePorDefecto();
            const firma = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario2.address,
                tokenId: 1,
                nonce: 0,
                deadline
            });

            await expect(
                nft.connect(usuario2).quemarPorDomo(1, deadline, firma)
            ).to.be.revertedWith('No eres dueno de este NFT');
        });

        it("Rechaza si NFT ya fue canjeado por domo", async function () {
            const tokenId = 1;
            const deadline = await deadlinePorDefecto();

            const firma1 = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId,
                nonce: 0,
                deadline
            });
            await nft.connect(usuario1).quemarPorDomo(tokenId, deadline, firma1);

            // El NFT ya no existe, así que ownerOf revierte con otro mensaje
            // Este test ahora es sobre un token inexistente
            const firma2 = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId,
                nonce: 1,
                deadline
            });

            await expect(
                nft.connect(usuario1).quemarPorDomo(tokenId, deadline, firma2)
            ).to.be.reverted;
        });

        it("Rechaza firma inválida", async function () {
            const deadline = await deadlinePorDefecto();
            const firma = await firmarQuemar(atacante, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId: 1,
                nonce: 0,
                deadline
            });

            await expect(
                nft.connect(usuario1).quemarPorDomo(1, deadline, firma)
            ).to.be.revertedWith('Firma invalida');
        });

        it("Rechaza si NFT caducó", async function () {
            // Avanzar 31 días
            await avanzarTiempo(31 * 24 * 60 * 60);

            const deadline = await deadlinePorDefecto();
            const firma = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId: 1,
                nonce: 0,
                deadline
            });

            await expect(
                nft.connect(usuario1).quemarPorDomo(1, deadline, firma)
            ).to.be.revertedWith('NFT ya caduco, no vale para canje');
        });

        it("Rechaza firma expirada", async function () {
            const deadline = await obtenerTimestamp() - 1;
            const firma = await firmarQuemar(backendSigner, {
                chainId,
                verifyingContract: await nft.getAddress(),
                usuario: usuario1.address,
                tokenId: 1,
                nonce: 0,
                deadline
            });

            await expect(
                nft.connect(usuario1).quemarPorDomo(1, deadline, firma)
            ).to.be.revertedWith('Firma expirada');
        });
    });

    // ============================================================
    // SOULBOUND (no transferible mientras activo)
    // ============================================================

    describe("Soulbound", function () {
        beforeEach(async function () {
            await nft.connect(usuario1).canjearPorTokens();
        });

        it("No se puede transferir mientras está activo", async function () {
            await expect(
                nft.connect(usuario1).transferFrom(usuario1.address, usuario2.address, 1)
            ).to.be.revertedWith('NFT activo: no se puede transferir');
        });

        it("Se puede transferir después de caducar", async function () {
            await avanzarTiempo(31 * 24 * 60 * 60);

            await nft.connect(usuario1).transferFrom(usuario1.address, usuario2.address, 1);

            expect(await nft.ownerOf(1)).to.equal(usuario2.address);
        });
    });

    // ============================================================
    // CONSULTAS
    // ============================================================

    describe("Consultas", function () {
        beforeEach(async function () {
            await nft.connect(usuario1).canjearPorTokens();
        });

        it("esValido devuelve true recién canjeado", async function () {
            expect(await nft.esValido(1)).to.equal(true);
        });

        it("esConmemorativo devuelve false recién canjeado", async function () {
            expect(await nft.esConmemorativo(1)).to.equal(false);
        });

        it("diasRestantes ~30 días recién canjeado", async function () {
            const dias = await nft.diasRestantes(1);
            expect(dias).to.be.gte(29).and.lte(30);
        });

        it("estadoNFT devuelve 'activo' recién canjeado", async function () {
            expect(await nft.estadoNFT(1)).to.equal('activo');
        });

        it("estadoNFT devuelve 'conmemorativo' tras caducar", async function () {
            await avanzarTiempo(31 * 24 * 60 * 60);
            expect(await nft.estadoNFT(1)).to.equal('conmemorativo');
        });

        it("tokenURI devuelve URL correcta (activo)", async function () {
            expect(await nft.tokenURI(1)).to.equal(BASE_URI + '1/activo.json');
        });

        it("tokenURI devuelve URL correcta (conmemorativo)", async function () {
            await avanzarTiempo(31 * 24 * 60 * 60);
            expect(await nft.tokenURI(1)).to.equal(BASE_URI + '1/conmemorativo.json');
        });
    });

    // ============================================================
    // ADMINISTRACIÓN
    // ============================================================

    describe("Administración", function () {
        it("Admin puede cambiar baseURI", async function () {
            const nueva = 'https://nueva.com/nft/';
            await nft.connect(admin).setBaseURI(nueva);
            expect(await nft.baseURI()).to.equal(nueva);
        });

        it("Admin puede cambiar contratoToken", async function () {
            await nft.connect(admin).setContratoToken(atacante.address);
            expect(await nft.contratoToken()).to.equal(atacante.address);
        });

        it("Admin puede cambiar backend signer", async function () {
            await nft.connect(admin).setBackendSigner(atacante.address);
            expect(await nft.backendSigner()).to.equal(atacante.address);
        });

        it("No-admin no puede cambiar baseURI", async function () {
            await expect(
                nft.connect(atacante).setBaseURI('hack')
            ).to.be.revertedWithCustomError(nft, 'AccessControlUnauthorizedAccount');
        });

        it("Admin puede pausar y despausar", async function () {
            await nft.connect(admin).pause();
            await nft.connect(admin).unpause();
        });
    });

    // ============================================================
    // PAUSABLE
    // ============================================================

    describe("Pausable", function () {
        it("canjearPorTokens falla si está pausado", async function () {
            await nft.connect(admin).pause();
            await expect(
                nft.connect(usuario1).canjearPorTokens()
            ).to.be.revertedWithCustomError(nft, 'EnforcedPause');
        });
    });
});