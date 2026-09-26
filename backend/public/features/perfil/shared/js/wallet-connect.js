// ================================================================
// WALLET CONNECT - Sariel's Ecosystem
// ================================================================
// Conexión universal de wallet compatible con:
// - Desktop con extensión MetaMask (window.ethereum)
// - Desktop con Coinbase Wallet, Rainbow, etc.
// - Móvil Chrome SIN extensión → usa WalletConnect v2
// - Móvil dentro del navegador de MetaMask/Coinbase → window.ethereum
//
// USO:
//   window.SarWallet.conectar() → abre modal y conecta
//   window.SarWallet.desconectar()
//   window.SarWallet.obtenerCuenta() → address o null
//   window.SarWallet.obtenerProvider() → provider para firmar
// ================================================================

(function () {
    'use strict';

    // ================================================================
    // CONFIGURACIÓN
    // ================================================================
    const WALLETCONNECT_PROJECT_ID = 'd080c5ef5c0e7109fd12f714d4ca25d5';

    // Red objetivo: 137 = Polygon Mainnet, 80002 = Amoy Testnet
    const CHAIN_ID_OBJETIVO = 137;

    const NETWORK_INFO = {
        137: {
            name: 'Polygon Mainnet',
            rpcUrl: 'https://polygon-rpc.com',
            explorer: 'https://polygonscan.com',
            symbol: 'POL'
        },
        80002: {
            name: 'Polygon Amoy',
            rpcUrl: 'https://rpc-amoy.polygon.technology/',
            explorer: 'https://amoy.polygonscan.com',
            symbol: 'POL'
        }
    };

    // ================================================================
    // ESTADO GLOBAL
    // ================================================================
    let wcProvider = null;
    let currentAccount = null;
    let currentProviderType = null;

    // ================================================================
    // DETECCIÓN DE ENTORNO
    // ================================================================

    function tieneInjectedProvider() {
        return typeof window.ethereum !== 'undefined' && window.ethereum !== null;
    }

    function esMovil() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function esNavegadorDeWallet() {
        if (!tieneInjectedProvider()) return false;
        return Boolean(
            window.ethereum.isMetaMask ||
            window.ethereum.isCoinbaseWallet ||
            window.ethereum.isTrust ||
            window.ethereum.isRainbow
        );
    }

    function esChromeMovilSinWallet() {
        return esMovil() && !tieneInjectedProvider();
    }

    // ================================================================
    // SESIÓN
    // ================================================================

    function guardarSesion(data) {
        try {
            localStorage.setItem('sar_wallet_session', JSON.stringify({
                tipo: data.tipo,
                address: data.address,
                chainId: data.chainId,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('No se pudo guardar sesión:', e);
        }
    }

    function leerSesion() {
        try {
            const raw = localStorage.getItem('sar_wallet_session');
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem('sar_wallet_session');
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    function limpiarSesion() {
        try {
            localStorage.removeItem('sar_wallet_session');
        } catch (e) {}
    }

    // ================================================================
    // CONEXIÓN INJECTED
    // ================================================================

    async function conectarConInjected() {
        if (!tieneInjectedProvider()) {
            throw new Error('INJECTED_NOT_AVAILABLE');
        }

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
            throw new Error('NO_ACCOUNTS_RETURNED');
        }

        const account = accounts[0];

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);

        if (chainId !== CHAIN_ID_OBJETIVO) {
            await cambiarRedInjected(CHAIN_ID_OBJETIVO);
        }

        currentAccount = account;
        currentProviderType = 'injected';

        guardarSesion({
            tipo: 'injected',
            address: account,
            chainId: CHAIN_ID_OBJETIVO
        });

        return {
            tipo: 'injected',
            address: account,
            chainId: CHAIN_ID_OBJETIVO,
            provider: window.ethereum
        };
    }

    async function cambiarRedInjected(chainId) {
        const info = NETWORK_INFO[chainId];
        if (!info) throw new Error('UNSUPPORTED_CHAIN');

        const chainIdHex = '0x' + chainId.toString(16);

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainIdHex,
                        chainName: info.name,
                        nativeCurrency: {
                            name: info.symbol,
                            symbol: info.symbol,
                            decimals: 18
                        },
                        rpcUrls: [info.rpcUrl],
                        blockExplorerUrls: [info.explorer]
                    }]
                });
            } else {
                throw switchError;
            }
        }
    }

    // ================================================================
    // CONEXIÓN WALLETCONNECT
    // ================================================================

    async function conectarConWalletConnect() {
        if (!WALLETCONNECT_PROJECT_ID) {
            throw new Error('WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED');
        }

        const { EthereumProvider } = await import(
            'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'
        );

        wcProvider = await EthereumProvider.init({
            projectId: WALLETCONNECT_PROJECT_ID,
            chains: [CHAIN_ID_OBJETIVO],
            optionalChains: [CHAIN_ID_OBJETIVO],
            showQrModal: true,
            qrModalOptions: {
                themeMode: 'dark',
                themeVariables: {
                    '--wcm-z-index': '99999'
                }
            },
            metadata: {
                name: "Sariel's",
                description: "Ecosistema Web3 Csariel's",
                url: window.location.origin,
                icons: [`${window.location.origin}/favicon.ico`]
            }
        });

        await wcProvider.connect();

        const accounts = wcProvider.accounts;
        if (!accounts || accounts.length === 0) {
            throw new Error('WALLETCONNECT_NO_ACCOUNTS');
        }

        const account = accounts[0];
        const chainId = wcProvider.chainId;

        currentAccount = account;
        currentProviderType = 'walletconnect';

        guardarSesion({
            tipo: 'walletconnect',
            address: account,
            chainId: chainId
        });

        wcProvider.on('accountsChanged', (accs) => {
            if (accs.length === 0) {
                desconectar();
            } else {
                currentAccount = accs[0];
                window.dispatchEvent(new CustomEvent('sar:wallet:accountsChanged', {
                    detail: { address: accs[0] }
                }));
            }
        });

        wcProvider.on('chainChanged', (cid) => {
            window.dispatchEvent(new CustomEvent('sar:wallet:chainChanged', {
                detail: { chainId: cid }
            }));
        });

        wcProvider.on('disconnect', () => {
            desconectar();
        });

        return {
            tipo: 'walletconnect',
            address: account,
            chainId: chainId,
            provider: wcProvider
        };
    }

    // ================================================================
    // MODAL DE OPCIONES
    // ================================================================

    function mostrarModalOpciones() {
        return new Promise((resolve, reject) => {
            const modal = document.createElement('div');
            modal.id = 'sar-wallet-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; z-index: 99998;
                background: rgba(5,8,15,0.95); backdrop-filter: blur(12px);
                display: flex; align-items: center; justify-content: center;
                padding: 20px;
            `;

            modal.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #0F2D1A, #05080f);
                    border: 2px solid #D4AF37; border-radius: 20px;
                    padding: 28px; max-width: 420px; width: 100%;
                    box-shadow: 0 0 60px rgba(212,175,55,0.3);
                ">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h2 style="font-family: Orbitron, monospace; color:#D4AF37; font-size:1.1rem; margin:0;">Conectar Wallet</h2>
                        <button id="sar-modal-cerrar" style="background:none; border:none; color:#8aa8b8; font-size:1.5rem; cursor:pointer;">✕</button>
                    </div>

                    <p style="color:#c0d8e8; font-size:0.85rem; margin-bottom:20px;">
                        Elige cómo conectar tu wallet:
                    </p>

                    <button id="sar-btn-walletconnect" style="
                        width:100%; padding:14px; margin-bottom:10px;
                        background: linear-gradient(135deg, #3b99fc, #2b7cd3);
                        color:white; border:none; border-radius:12px;
                        font-weight:600; font-size:0.9rem; cursor:pointer;
                    ">
                        🔗 WalletConnect (recomendado)
                    </button>

                    <button id="sar-btn-metamask" style="
                        width:100%; padding:14px;
                        background: linear-gradient(135deg, #f6851b, #e2761b);
                        color:white; border:none; border-radius:12px;
                        font-weight:600; font-size:0.9rem; cursor:pointer;
                    ">
                        🦊 MetaMask (extensión de escritorio)
                    </button>

                    <p style="color:#8aa8b8; font-size:0.7rem; margin-top:16px; text-align:center;">
                        ¿En móvil? Usa WalletConnect para abrir MetaMask, Coinbase o Rainbow.
                    </p>
                </div>
            `;

            document.body.appendChild(modal);

            const cerrar = () => {
                modal.remove();
                reject(new Error('USER_CANCELLED'));
            };

            modal.querySelector('#sar-modal-cerrar').onclick = cerrar;
            modal.onclick = (e) => { if (e.target === modal) cerrar(); };

            modal.querySelector('#sar-btn-walletconnect').onclick = async () => {
                try {
                    modal.querySelector('#sar-btn-walletconnect').textContent = '⏳ Abriendo WalletConnect...';
                    const result = await conectarConWalletConnect();
                    modal.remove();
                    resolve(result);
                } catch (e) {
                    modal.remove();
                    reject(e);
                }
            };

            modal.querySelector('#sar-btn-metamask').onclick = async () => {
                try {
                    if (!tieneInjectedProvider()) {
                        alert('MetaMask no está instalado como extensión. En móvil, usa WalletConnect.');
                        return;
                    }
                    const result = await conectarConInjected();
                    modal.remove();
                    resolve(result);
                } catch (e) {
                    modal.remove();
                    reject(e);
                }
            };
        });
    }

    // ================================================================
    // FUNCIÓN PRINCIPAL
    // ================================================================

    async function conectar() {
        const sesion = leerSesion();
        if (sesion && sesion.address) {
            currentAccount = sesion.address;
            currentProviderType = sesion.tipo;
            return {
                tipo: sesion.tipo,
                address: sesion.address,
                chainId: sesion.chainId,
                reconnected: true
            };
        }

        if (esChromeMovilSinWallet()) {
            return await conectarConWalletConnect();
        }

        if (tieneInjectedProvider() && !esMovil()) {
            return await conectarConInjected();
        }

        if (esNavegadorDeWallet()) {
            return await conectarConInjected();
        }

        return await mostrarModalOpciones();
    }

    async function desconectar() {
        try {
            if (wcProvider) {
                await wcProvider.disconnect();
                wcProvider = null;
            }
        } catch (e) {
            console.warn('Error desconectando WC:', e);
        }

        currentAccount = null;
        currentProviderType = null;
        limpiarSesion();

        window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
    }

    function obtenerProvider() {
        if (currentProviderType === 'injected') return window.ethereum;
        if (currentProviderType === 'walletconnect') return wcProvider;
        return null;
    }

    function obtenerCuenta() {
        return currentAccount;
    }

    // ================================================================
    // EXPORTS
    // ================================================================
    window.SarWallet = {
        conectar,
        desconectar,
        obtenerProvider,
        obtenerCuenta,
        tieneInjectedProvider,
        esMovil,
        esNavegadorDeWallet,
        esChromeMovilSinWallet
    };

    console.log('✅ SarWallet cargado');
})();