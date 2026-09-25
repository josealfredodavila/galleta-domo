// ================================================================
// TESTS - CSARIEL'S TOKEN (ES.TOKS / GAL)
// ================================================================

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const {
    firmarClaim,
    firmarVenta,          // <- NUEVO: helper para firmar ventas del Muro
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

        it("Admin tiene DEFAULT_ADMIN_ROLE, PAUSER_ROLE, MINTER_ROLE, MURO_ROLE", async function () {
            expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await token.hasRole(await token.PAUSER_ROLE(), admin.address)).to.equal(true);
            expect(await token.hasRole(await token.MINTER_ROLE(), admin.address)).to.equal(true);
            expect(await token.hasRole(await token.MURO_ROLE(), admin.address)).to.equal(true);
        });

        it("Backend tiene MINTER_ROLE y MURO_ROLE", async function () {
            expect(await token.hasRole(await token.MINTER_ROLE(), backendSigner.address)).to.equal(true);
            expect(await token.hasRole(await token.MURO_ROLE(), backendSigner.address)).to.equal(true);
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
    // RECLAMAR TOKENS CON QR
    // ============================================================

    describe("reclamarTokens", function () {
        it("Mintea 1 ES.TOKS con firma válida", async function () {
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

            await expect(
                token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma)
            ).to.emit(token, 'TokensMinteados')
             .withArgs(usuario1.address, qrId, cantidad, anyValue);

            expect(await token.balanceOf(usuario1.address)).to.equal(cantidad);
            expect(await token.totalSupply()).to.equal(cantidad);
            expect(await token.qrUsado(qrId)).to.equal(true);
        });

        it("Rechaza QR ya usado", async function () {
            const qrId = 1002;
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

            await token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma1);

            // Intento 2 con mismo QR
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
                token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma2)
            ).to.be.revertedWith('QR ya usado');
        });

        it("Rechaza firma expirada", async function () {
            const qrId = 1003;
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
                token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma)
            ).to.be.revertedWith('Firma expirada');
        });

        it("Rechaza firma inválida (firmante incorrecto)", async function () {
            const qrId = 1004;
            const cantidad = TOKEN_INICIAL;
            const deadline = await deadlinePorDefecto();

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
                token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma)
            ).to.be.revertedWith('Firma invalida o firmante incorrecto');
        });

        it("Rechaza cantidad 0", async function () {
            const deadline = await deadlinePorDefecto();
            const firma = await firmarClaim(backendSigner, {
                chainId,
                verifyingContract: await token.getAddress(),
                usuario: usuario1.address,
                qrId: 1005,
                cantidad: 0,
                nonce: 0,
                deadline
            });

            await expect(
                token.connect(usuario1).reclamarTokens(1005, 0, deadline, firma)
            ).to.be.revertedWith('Cantidad debe ser mayor a 0');
        });

        it("Incrementa nonce después de reclamar", async function () {
            const qrId = 1006;
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

            await token.connect(usuario1).reclamarTokens(qrId, cantidad, deadline, firma);

            expect(await token.nonceActual(usuario1.address)).to.equal(1);
        });
    });

    // ============================================================
    // VENDER EN MURO P2P
    // ============================================================
    // ⚠️  CAMBIO DE SEGURIDAD: `venderEnMuro` ahora recibe `deadline` y
    // `firma` del VENDEDOR (no del backend). Todos los tests de este
    // bloque generan la firma del vendedor antes de llamar a la función.
    // ============================================================

    describe("venderEnMuro", function () {
        beforeEach(async function () {
            // Mintear 100 tokens a usuario1
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
            await token.connect(usuario1).reclamarTokens(2001, cantidad, deadline, firma);
        });

        it("Aplica 3% de comisión", async function () {
            const monto = ethers.parseEther('10');
            const comision = (monto * 300n) / 10000n;       // 0.3
            const netoComprador = monto - comision;          // 9.7

            // El VENDEDOR (usuario1) firma autorizando la venta
            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);
            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            await token.connect(backendSigner).venderEnMuro(
                usuario1.address,
                usuario2.address,
                monto,
                deadline,
                firma
            );

            expect(await token.balanceOf(usuario2.address)).to.equal(netoComprador);
            expect(await token.balanceOf(walletComisiones.address)).to.equal(comision);
        });

        it("Incrementa el nonce del vendedor tras la venta", async function () {
            const monto = ethers.parseEther('5');

            expect(await token.nonceActual(usuario1.address)).to.equal(1);

            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);
            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            await token.connect(backendSigner).venderEnMuro(
                usuario1.address,
                usuario2.address,
                monto,
                deadline,
                firma
            );

            expect(await token.nonceActual(usuario1.address)).to.equal(2);
        });

        it("Rechaza si no es MURO_ROLE", async function () {
            const monto = ethers.parseEther('1');

            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);
            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            await expect(
                token.connect(atacante).venderEnMuro(
                    usuario1.address,
                    usuario2.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWithCustomError(token, 'AccessControlUnauthorizedAccount');
        });

        it("Rechaza si vendedor sin saldo", async function () {
            const monto = ethers.parseEther('1');

            // El vendedor es usuario2 (sin saldo). Igual firma.
            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario2.address);
            const firma = await firmarVenta(usuario2, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario2.address,
                comprador: usuario1.address,
                monto,
                nonce,
                deadline
            });

            await expect(
                token.connect(backendSigner).venderEnMuro(
                    usuario2.address,
                    usuario1.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Vendedor sin saldo');
        });

        it("Rechaza vendedor == comprador", async function () {
            const monto = ethers.parseEther('1');

            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);
            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario1.address,
                monto,
                nonce,
                deadline
            });

            await expect(
                token.connect(backendSigner).venderEnMuro(
                    usuario1.address,
                    usuario1.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('No puedes venderte a ti mismo');
        });

        // --------------------------------------------------------
        // NUEVOS TESTS DE SEGURIDAD
        // --------------------------------------------------------

        it("Rechaza si la firma no es del vendedor", async function () {
            const monto = ethers.parseEther('1');

            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);

            // ⚠️  atacante firma un mensaje que dice que usuario1 vende,
            // pero la firma NO corresponde a usuario1 → debe revertir.
            const firma = await firmarVenta(atacante, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            await expect(
                token.connect(backendSigner).venderEnMuro(
                    usuario1.address,
                    usuario2.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Firma invalida: no autorizada por el vendedor');
        });

        it("Rechaza firma expirada", async function () {
            const monto = ethers.parseEther('1');

            // Deadline en el pasado
            const deadline = (await obtenerTimestamp()) - 1;
            const nonce = await token.nonceActual(usuario1.address);

            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            await expect(
                token.connect(backendSigner).venderEnMuro(
                    usuario1.address,
                    usuario2.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Firma expirada');
        });

        it("No permite reusar la misma firma (anti-replay)", async function () {
            const monto = ethers.parseEther('1');

            const deadline = await deadlinePorDefecto();
            const nonce = await token.nonceActual(usuario1.address);
            const firma = await firmarVenta(usuario1, {
                chainId,
                verifyingContract: await token.getAddress(),
                vendedor: usuario1.address,
                comprador: usuario2.address,
                monto,
                nonce,
                deadline
            });

            // 1ra venta: OK
            await token.connect(backendSigner).venderEnMuro(
                usuario1.address,
                usuario2.address,
                monto,
                deadline,
                firma
            );

            // 2da venta con la MISMA firma: debe revertir porque
            // nonces[vendedor] ya se incrementó a 2.
            await expect(
                token.connect(backendSigner).venderEnMuro(
                    usuario1.address,
                    usuario2.address,
                    monto,
                    deadline,
                    firma
                )
            ).to.be.revertedWith('Firma invalida: no autorizada por el vendedor');
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
            // Mintear 12 tokens a usuario1
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
            await token.connect(usuario1).reclamarTokens(3001, DOCE_TOKENS, deadline, firma);

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
            // El anterior pierde roles
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
                token.connect(usuario1).reclamarTokens(4001, TOKEN_INICIAL, deadline, firma)
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

        it("ventaTypehash devuelve el hash correcto", async function () {
            expect(await token.ventaTypehash()).to.equal(
                ethers.keccak256(ethers.toUtf8Bytes(
                    'Venta(address vendedor,address comprador,uint256 monto,uint256 nonce,uint256 deadline)'
                ))
            );
        });
    });
});

// Helper para anyValue en eventos
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');