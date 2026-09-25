// ================================================================
// TESTS - CSARIEL'S TOKEN (ES.TOKS / GAL)
// ================================================================

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
    firmarClaim,
    deployToken,
    avanzarTiempo,
    obtenerTimestamp,
    deadlinePorDefecto
} = require('./helpers');

describe("CsarielsToken", function () {
    let token;
    let admin, backendSigner, walletComisiones, usuario1, usuario2, atacante;
    let chainId;

    const TOKEN_INICIAL = ethers.parseEther('1');
    const DOCE_TOKENS = ethers.parseEther('12');

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
    });

    // ============================================================
    // DESPLIEGUE
    // ============================================================

    describe("Despliegue", function () {
        it("Nombre y símbolo correctos", async function () {
            expect(await token.name()).to.equal("Csariel's Token");
            expect(await token.symbol()).to.equal('GAL');
        });

        it("MAX_SUPPLY es 1 millón", async function () {
            expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther('1000000'));
        });

        it("Comisión del muro es 3%", async function () {
            expect(await token.COMISION_MURO_BPS()).to.equal(300);
            expect(await token.BPS_DENOMINATOR()).to.equal(10000);
        });

        it("Admin tiene DEFAULT_ADMIN_ROLE, PAUSER_ROLE, MINTER_ROLE", async function () {
            expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await token.hasRole(await token.PAUSER_ROLE(), admin.address)).to.equal(true);
            expect(await token.hasRole(await token.MINTER_ROLE(), admin.address)).to.equal(true);
        });

        it("Backend tiene MINTER_ROLE", async function () {
            expect(await token.hasRole(await token.MINTER_ROLE(), backendSigner.address)).to.equal(true);
        });

        it("Backend NO tiene DEFAULT_ADMIN_ROLE", async function () {
            expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), backendSigner.address)).to.equal(false);
        });

        it("Version es 1.0.0", async function () {
            expect(await token.version()).to.equal('1.0.0');
        });

        it("Supply inicial es 0", async function () {
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    // ============================================================
    // RECLAMAR TOKENS CON QR (BACKEND PAGA GAS)
    // ============================================================
    // ⚠️ CAMBIO DE MODELO: el backend (MINTER_ROLE) llama a la función
    // y paga el gas. El usuario solo recibe los tokens en su wallet.
    // ============================================================

    describe("reclamarTokens", function () {
        it("Backend mintea 1 ES.TOKS a la wallet del usuario con firma válida", async function () {
            const qrId = 1001;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);

            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce,
                deadline
            });

            // El BACKEND llama, no el usuario
            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    qrId,
                    cantidad,
                    deadline,
                    firma
                )
            ).to.emit(token, 'TokensMinteados')
             .withArgs(usuario1.address, qrId, cantidad, anyValue);

            // Los tokens van a usuario1, no al backend
            expect(await token.balanceOf(usuario1.address)).to.equal(cantidad);
            expect(await token.balanceOf(backendSigner.address)).to.equal(0);
            expect(await token.totalSupply()).to.equal(cantidad);
            expect(await token.qrUsado(qrId)).to.equal(true);
        });

        it("Rechaza si un no-MINTER intenta llamar", async function () {
            const qrId = 1002;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();

            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 0,
                deadline
            });

            // usuario1 (no tiene MINTER_ROLE) intenta llamar
            await expect(
                token.connect(usuario1).reclamarTokens(
                    usuario1.address,
                    qrId,
                    cantidad,
                    deadline,
                    firma
                )
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });

        it("Rechaza QR ya usado", async function () {
            const qrId = 1003;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();

            const firma1 = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 0,
                deadline
            });

            await token.connect(backendSigner).reclamarTokens(
                usuario1.address,
                qrId,
                cantidad,
                deadline,
                firma1
            );

            // Intento 2 con mismo QR (nonce ya avanzó a 1)
            const firma2 = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 1,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    qrId,
                    cantidad,
                    deadline,
                    firma2
                )
            ).to.be.revertedWith('QR ya usado');
        });

        it("Rechaza firma expirada", async function () {
            const qrId = 1004;
            const cantidad = TOKEN_INICIAL;
            const deadline = await obtenerTimestamp() - 1;

            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    qrId,
                    cantidad,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Firma expirada');
        });

        it("Rechaza firma inválida (firmante incorrecto)", async function () {
            const qrId = 1005;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();

            // El atacante firma, no el backend
            const firma = await firmarClaim(atacante, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    qrId,
                    cantidad,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Firma invalida o firmante incorrecto');
        });

        it("Rechaza cantidad 0", async function () {
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 1006,
                cantidad: 0,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    1006,
                    0,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Cantidad debe ser mayor a 0');
        });

        it("Rechaza usuarioReceptor = address(0)", async function () {
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: ethers.ZeroAddress,
                qrId: 1007,
                cantidad: TOKEN_INICIAL,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    ethers.ZeroAddress,
                    1007,
                    TOKEN_INICIAL,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Usuario receptor invalido');
        });

        it("Incrementa nonce del receptor después de reclamar", async function () {
            const qrId = 1008;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();

            expect(await token.nonceActual(usuario1.address)).to.equal(0);

            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId,
                cantidad,
                nonce: 0,
                deadline
            });

            await token.connect(backendSigner).reclamarTokens(
                usuario1.address,
                qrId,
                cantidad,
                deadline,
                firma
            );

            expect(await token.nonceActual(usuario1.address)).to.equal(1);
        });
    });

    // ============================================================
    // VENDER EN MURO P2P (VENDEDOR PAGA GAS)
    // ============================================================
    // ⚠️ CAMBIO DE MODELO: sin firma EIP-712, sin MURO_ROLE.
    // El vendedor (msg.sender) llama directo y paga su gas.
    // ============================================================

    describe("venderEnMuro", function () {
        beforeEach(async function () {
            // Mintear 100 tokens a usuario1 (usando el backend como relayer)
            const cantidad = ethers.parseEther('100');
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 2001,
                cantidad,
                nonce: 0,
                deadline
            });
            await token.connect(backendSigner).reclamarTokens(
                usuario1.address,
                2001,
                cantidad,
                deadline,
                firma
            );
        });

        it("Aplica 3% de comisión", async function () {
            const monto = ethers.parseEther('10');
            const comision = (monto * 300n) / 10000n;       // 0.3
            const netoComprador = monto - comision;          // 9.7

            // usuario1 (vendedor) llama directo
            await token.connect(usuario1).venderEnMuro(
                usuario2.address,
                monto
            );

            expect(await token.balanceOf(usuario2.address)).to.equal(netoComprador);
            expect(await token.balanceOf(walletComisiones.address)).to.equal(comision);
            // usuario1 perdió 10 tokens
            expect(await token.balanceOf(usuario1.address)).to.equal(ethers.parseEther('90'));
        });

        it("Cualquiera con saldo puede vender (no requiere rol)", async function () {
            const monto = ethers.parseEther('5');

            // usuario2 no tiene rol, pero tampoco saldo aquí,
            // así que le minteamos primero para probar que puede vender.
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario2.address,
                qrId: 2002,
                cantidad: ethers.parseEther('10'),
                nonce: 0,
                deadline
            });
            await token.connect(backendSigner).reclamarTokens(
                usuario2.address,
                2002,
                ethers.parseEther('10'),
                deadline,
                firma
            );

            // usuario2 vende sin tener ningún rol especial
            await expect(
                token.connect(usuario2).venderEnMuro(usuario1.address, monto)
            ).to.emit(token, 'VentaMuro');
        });

        it("Rechaza si vendedor sin saldo", async function () {
            const monto = ethers.parseEther('1');

            // usuario2 no tiene tokens
            await expect(
                token.connect(usuario2).venderEnMuro(usuario1.address, monto)
            ).to.be.revertedWith('Vendedor sin saldo');
        });

        it("Rechaza vendedor == comprador", async function () {
            const monto = ethers.parseEther('1');

            await expect(
                token.connect(usuario1).venderEnMuro(usuario1.address, monto)
            ).to.be.revertedWith('No puedes venderte a ti mismo');
        });

        it("Rechaza comprador address(0)", async function () {
            const monto = ethers.parseEther('1');

            await expect(
                token.connect(usuario1).venderEnMuro(ethers.ZeroAddress, monto)
            ).to.be.revertedWith('Comprador invalido');
        });

        it("Rechaza monto 0", async function () {
            await expect(
                token.connect(usuario1).venderEnMuro(usuario2.address, 0)
            ).to.be.revertedWith('Monto debe ser mayor a 0');
        });

        it("Emite evento VentaMuro con datos correctos", async function () {
            const monto = ethers.parseEther('10');
            const comision = (monto * 300n) / 10000n;
            const netoComprador = monto - comision;

            await expect(
                token.connect(usuario1).venderEnMuro(usuario2.address, monto)
            ).to.emit(token, 'VentaMuro')
             .withArgs(
                usuario1.address,
                usuario2.address,
                monto,
                netoComprador,
                comision,
                anyValue
             );
        });
    });

    // ============================================================
    // QUEMAR POR CANJE (NFT_ROLE)
    // ============================================================

    describe("quemarPorCanje", function () {
        it("Solo NFT_ROLE puede quemar", async function () {
            await expect(
                token.connect(atacante).quemarPorCanje(usuario1.address, TOKEN_INICIAL)
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });

        it("NFT_ROLE configurado vía setContratoNFT puede quemar", async function () {
            // Mintear 12 tokens a usuario1 (usando el backend)
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 3001,
                cantidad: DOCE_TOKENS,
                nonce: 0,
                deadline
            });
            await token.connect(backendSigner).reclamarTokens(
                usuario1.address,
                3001,
                DOCE_TOKENS,
                deadline,
                firma
            );

            // Simular que `atacante` es el contrato NFT
            await token.connect(admin).setContratoNFT(atacante.address);

            expect(await token.hasRole(await token.NFT_ROLE(), atacante.address)).to.equal(true);

            await token.connect(atacante).quemarPorCanje(usuario1.address, DOCE_TOKENS);

            expect(await token.balanceOf(usuario1.address)).to.equal(0);
        });

        it("Rechaza si usuario sin saldo", async function () {
            await token.connect(admin).setContratoNFT(atacante.address);

            await expect(
                token.connect(atacante).quemarPorCanje(usuario1.address, TOKEN_INICIAL)
            ).to.be.revertedWith('Usuario sin saldo suficiente');
        });
    });

    // ============================================================
    // ADMINISTRACIÓN
    // ============================================================

    describe("Administración", function () {
        it("Admin puede cambiar backend signer", async function () {
            await token.connect(admin).setBackendSigner(atacante.address);

            expect(await token.backendSigner()).to.equal(atacante.address);
            expect(await token.hasRole(await token.MINTER_ROLE(), atacante.address)).to.equal(true);
            // El anterior pierde MINTER_ROLE
            expect(await token.hasRole(await token.MINTER_ROLE(), backendSigner.address)).to.equal(false);
        });

        it("Admin puede cambiar wallet de comisiones", async function () {
            await token.connect(admin).setWalletComisiones(atacante.address);

            expect(await token.walletComisiones()).to.equal(atacante.address);
        });

        it("No-admin no puede cambiar backend signer", async function () {
            await expect(
                token.connect(atacante).setBackendSigner(atacante.address)
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });

        it("No-admin no puede cambiar wallet de comisiones", async function () {
            await expect(
                token.connect(atacante).setWalletComisiones(atacante.address)
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });

        it("Admin puede pausar y despausar", async function () {
            await token.connect(admin).pause();
            await token.connect(admin).unpause();
        });

        it("No-admin no puede pausar", async function () {
            await expect(
                token.connect(atacante).pause()
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });
    });

    // ============================================================
    // PAUSABLE
    // ============================================================

    describe("Pausable", function () {
        it("reclamarTokens falla si está pausado", async function () {
            await token.connect(admin).pause();

            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 4001,
                cantidad: TOKEN_INICIAL,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(backendSigner).reclamarTokens(
                    usuario1.address,
                    4001,
                    TOKEN_INICIAL,
                    deadline,
                    firma
                )
            ).to.be.revertedWithCustomError(token, 'EnforcedPause');
        });

        it("venderEnMuro falla si está pausado", async function () {
            // Primero minteamos 10 tokens a usuario1
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 4002,
                cantidad: ethers.parseEther('10'),
                nonce: 0,
                deadline
            });
            await token.connect(backendSigner).reclamarTokens(
                usuario1.address,
                4002,
                ethers.parseEther('10'),
                deadline,
                firma
            );

            await token.connect(admin).pause();

            await expect(
                token.connect(usuario1).venderEnMuro(usuario2.address, ethers.parseEther('1'))
            ).to.be.revertedWithCustomError(token, 'EnforcedPause');
        });
    });

    // ============================================================
    // UPGRADE UUPS
    // ============================================================

    describe("UUPS Upgrade", function () {
        it("Admin puede upgrade", async function () {
            const CsarielsTokenV2 = await ethers.getContractFactory('CsarielsToken');
            const tokenV2 = await upgrades.upgradeProxy(await token.getAddress(), CsarielsTokenV2);
            await tokenV2.waitForDeployment();

            expect(await tokenV2.version()).to.equal('1.0.0');
        });

        it("No-admin no puede upgrade", async function () {
            const CsarielsTokenV2 = await ethers.getContractFactory('CsarielsToken', atacante);
            await expect(
                upgrades.upgradeProxy(await token.getAddress(), CsarielsTokenV2)
            ).to.be.reverted;
        });
    });

    // ============================================================
    // CONSULTAS
    // ============================================================

    describe("Consultas", function () {
        it("supplyRestante empieza en MAX_SUPPLY", async function () {
            expect(await token.supplyRestante()).to.equal(await token.MAX_SUPPLY());
        });

        it("domainSeparator y claimTypehash devuelven valores", async function () {
            expect(await token.domainSeparator()).to.not.equal(ethers.ZeroHash);
            expect(await token.claimTypehash()).to.equal(
                ethers.keccak256(ethers.toUtf8Bytes(
                    'Claim(address usuario,uint256 qrId,uint256 cantidad,uint256 nonce,uint256 deadline)'
                ))
            );
        });
    });
});

// Helper para anyValue en eventos
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');