// ================================================================
// WALLET CONNECT - Sariel's Ecosystem
// ================================================================
// Conexión universal de wallet compatible con:
// - Desktop con extensión MetaMask (window.ethereum)
// - Móvil dentro del navegador de MetaMask (window.ethereum)
// - Móvil Chrome/Safari SIN extensión → usa deep link a MetaMask
// - Fallback: WalletConnect v2 para otras wallets (Rainbow, Coinbase, etc.)
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
    // CONFIGURACIÓN - RED OBJETIVO
    // ================================================================
    // ⚠️ CAMBIAR AQUÍ cuando pases a producción:
    //
    // TESTNET (pruebas gratis):
    //   const RED_ACTIVA = 'AMOY';
    //
    // MAINNET (producción, dinero real):
    //   const RED_ACTIVA = 'MAINNET';
    // ================================================================
    const RED_ACTIVA = 'AMOY'; // ← Cambiar a 'MAINNET' para producción

    const REDES = {
        MAINNET: {
            chainId: 137,
            chainIdHex: '0x89',
            name: 'Polygon Mainnet',
            rpcUrl: 'https://polygon-rpc.com',
            explorer: 'https://polygonscan.com',
            symbol: 'POL'
        },
        AMOY: {
            chainId: 80002,
            chainIdHex: '0x13882',
            name: 'Polygon Amoy',
            rpcUrl: 'https://rpc-amoy.polygon.technology/',
            explorer: 'https://amoy.polygonscan.com',
            symbol: 'POL'
        }
    };

    const RED = REDES[RED_ACTIVA];
    const CHAIN_ID_OBJETIVO = RED.chainId;
    const CHAIN_ID_HEX = RED.chainIdHex;

    // ================================================================
    // CONFIGURACIÓN - WALLETCONNECT
    // ================================================================
    const WALLETCONNECT_PROJECT_ID = 'd080c5ef5c0e7109fd12f714d4ca25d5';

    // Dominio de tu dApp (SIN https://) para el deep link de MetaMask
    const DAPP_DOMAIN = 'galleta-domo-production.up.railway.app';

    // ================================================================
    // ESTADO GLOBAL
    // ================================================================
    let wcProvider = null;
    let currentAccount = null;
    let currentProviderType = null;
    let visibilityListenerActivo = null;

    // ================================================================
    // DETECCIÓN DE ENTORNO
    // ================================================================

    function tieneInjectedProvider() {
        return typeof window.ethereum !== 'undefined' && window.ethereum !== null;
    }

    function esMovil() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function esAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    function esIOS() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    function esNavegadorDeMetaMask() {
        if (!tieneInjectedProvider()) return false;
        return Boolean(window.ethereum.isMetaMask);
    }

    function esNavegadorDeCoinbase() {
        if (!tieneInjectedProvider()) return false;
        return Boolean(window.ethereum.isCoinbaseWallet);
    }

    function esNavegadorMovilSinWallet() {
        return esMovil() && !tieneInjectedProvider();
    }

    // ================================================================
    // DEEP LINKS
    // ================================================================

    function construirDeepLinkMetaMask() {
        const pathActual = window.location.pathname + window.location.search;
        return 'https://metamask.app.link/dapp/' + DAPP_DOMAIN + pathActual;
    }

    function abrirMetaMaskApp() {
        const deepLink = construirDeepLinkMetaMask();
        console.log('🔗 Abriendo MetaMask con deep link:', deepLink);
        // Redirigir en la misma ventana
        window.location.href = deepLink;
    }

    function abrirRainbowApp() {
        const url = encodeURIComponent(window.location.href);
        const deepLink = 'https://rnbwapp.com/dapp?url=' + url;
        console.log('🔗 Abriendo Rainbow con deep link:', deepLink);
        window.location.href = deepLink;
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
    // CONEXIÓN VÍA window.ethereum
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

        const chainIdHexActual = await window.ethereum.request({ method: 'eth_chainId' });
        const chainIdActual = parseInt(chainIdHexActual, 16);

        if (chainIdActual !== CHAIN_ID_OBJETIVO) {
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
        const info = RED;
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
    // MODAL DE ELECCIÓN DE WALLET (para móvil)
    // ================================================================

    function mostrarModalMovil() {
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

                    <div id="sar-modal-contenido">
                        <p style="color:#c0d8e8; font-size:0.85rem; margin-bottom:20px;">
                            Elige tu wallet preferida:
                        </p>

                        <button id="sar-btn-mm" style="
                            width:100%; padding:14px; margin-bottom:10px;
                            background: linear-gradient(135deg, #f6851b, #e2761b);
                            color:white; border:none; border-radius:12px;
                            font-weight:600; font-size:0.9rem; cursor:pointer;
                            display:flex; align-items:center; justify-content:center; gap:10px;
                        ">
                            🦊 MetaMask
                        </button>

                        <button id="sar-btn-rainbow" style="
                            width:100%; padding:14px; margin-bottom:10px;
                            background: linear-gradient(135deg, #001E59, #174299);
                            color:white; border:none; border-radius:12px;
                            font-weight:600; font-size:0.9rem; cursor:pointer;
                            display:flex; align-items:center; justify-content:center; gap:10px;
                        ">
                            🌈 Rainbow
                        </button>

                        <button id="sar-btn-wc" style="
                            width:100%; padding:14px;
                            background: linear-gradient(135deg, #3b99fc, #2b7cd3);
                            color:white; border:none; border-radius:12px;
                            font-weight:600; font-size:0.9rem; cursor:pointer;
                            display:flex; align-items:center; justify-content:center; gap:10px;
                        ">
                            🔗 Otra wallet (WalletConnect)
                        </button>

                        <p style="color:#8aa8b8; font-size:0.7rem; margin-top:16px; text-align:center;">
                            Se abrirá la app de tu wallet para que autorices la conexión.
                        </p>
                    </div>

                    <div id="sar-modal-esperando" style="display:none;">
                        <div style="text-align:center; padding:20px 0;">
                            <div style="font-size:3rem; margin-bottom:12px;">⏳</div>
                            <p style="color:#c0d8e8; font-size:0.9rem; margin-bottom:8px;">
                                Esperando a MetaMask...
                            </p>
                            <p style="color:#8aa8b8; font-size:0.75rem; margin-bottom:20px;">
                                Aprueba la conexión dentro de la app. Si no se abrió, toca el botón de abajo.
                            </p>
                            <button id="sar-btn-reintentar" style="
                                width:100%; padding:14px; margin-bottom:10px;
                                background: linear-gradient(135deg, #f6851b, #e2761b);
                                color:white; border:none; border-radius:12px;
                                font-weight:600; font-size:0.9rem; cursor:pointer;
                            ">
                                🔄 Abrir MetaMask manualmente
                            </button>
                            <button id="sar-btn-cancelar-espera" style="
                                width:100%; padding:10px;
                                background: transparent;
                                color:#8aa8b8; border:1px solid #8aa8b8; border-radius:12px;
                                font-weight:500; font-size:0.8rem; cursor:pointer;
                            ">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const contenido = modal.querySelector('#sar-modal-contenido');
            const esperando = modal.querySelector('#sar-modal-esperando');

            const cerrar = () => {
                if (visibilityListenerActivo) {
                    document.removeEventListener('visibilitychange', visibilityListenerActivo);
                    visibilityListenerActivo = null;
                }
                modal.remove();
                reject(new Error('USER_CANCELLED'));
            };

            modal.querySelector('#sar-modal-cerrar').onclick = cerrar;
            modal.onclick = (e) => { if (e.target === modal) cerrar(); };

            // ============================================================
            // ESTADO DE ESPERA CON DETECCIÓN DE REGRESO
            // ============================================================
            function mostrarEstadoEsperando(nombreWallet, funcionAbrir) {
                contenido.style.display = 'none';
                esperando.style.display = 'block';

                // Escuchar cuando el usuario regrese a la dApp
                let regresoDetectado = false;

                visibilityListenerActivo = () => {
                    if (document.visibilityState === 'visible' && !regresoDetectado) {
                        regresoDetectado = true;
                        console.log('👁️ Usuario regresó a la dApp');

                        // Esperar 1 segundo y verificar si window.ethereum ya está disponible
                        setTimeout(async () => {
                            try {
                                if (tieneInjectedProvider()) {
                                    console.log('✅ window.ethereum detectado. Conectando...');
                                    const result = await conectarConInjected();
                                    if (visibilityListenerActivo) {
                                        document.removeEventListener('visibilitychange', visibilityListenerActivo);
                                        visibilityListenerActivo = null;
                                    }
                                    modal.remove();
                                    resolve(result);
                                } else {
                                    console.log('⚠️ Aún sin window.ethereum. Esperando más...');
                                    // Resetear para permitir otra detección
                                    regresoDetectado = false;
                                }
                            } catch (e) {
                                console.warn('Error tras regresar:', e);
                                regresoDetectado = false;
                            }
                        }, 1000);
                    }
                };

                document.addEventListener('visibilitychange', visibilityListenerActivo);

                // Abrir la wallet
                funcionAbrir();

                // Auto-mostrar el botón de reintentar después de 5 segundos
                setTimeout(() => {
                    const btnReintentar = modal.querySelector('#sar-btn-reintentar');
                    if (btnReintentar) {
                        btnReintentar.textContent = '🔄 Abrir ' + nombreWallet + ' de nuevo';
                    }
                }, 5000);
            }

            // --- Botón MetaMask ---
            modal.querySelector('#sar-btn-mm').onclick = async () => {
                try {
                    // Si ya estamos dentro del navegador de MetaMask, conexión directa
                    if (esNavegadorDeMetaMask()) {
                        const result = await conectarConInjected();
                        modal.remove();
                        resolve(result);
                        return;
                    }
                    // Si estamos en Chrome/Safari móvil, mostrar espera + abrir deep link
                    mostrarEstadoEsperando('MetaMask', abrirMetaMaskApp);
                } catch (e) {
                    console.error('Error conectando MetaMask:', e);
                    modal.remove();
                    reject(e);
                }
            };

            // --- Botón Rainbow ---
            modal.querySelector('#sar-btn-rainbow').onclick = () => {
                mostrarEstadoEsperando('Rainbow', abrirRainbowApp);
            };

            // --- Botón WalletConnect ---
            modal.querySelector('#sar-btn-wc').onclick = async () => {
                try {
                    modal.querySelector('#sar-btn-wc').textContent = '⏳ Cargando WalletConnect...';
                    const result = await conectarConWalletConnect();
                    modal.remove();
                    resolve(result);
                } catch (e) {
                    modal.remove();
                    reject(e);
                }
            };

            // --- Botón reintentar (abre la wallet de nuevo) ---
            modal.querySelector('#sar-btn-reintentar').onclick = () => {
                const nombreBoton = modal.querySelector('#sar-btn-mm').textContent.trim();
                // Detectar qué wallet estaba esperando
                if (contenido.style.display === 'none' && esperando.style.display === 'block') {
                    // Reintentar con MetaMask por defecto
                    abrirMetaMaskApp();
                }
            };

            // --- Botón cancelar espera ---
            modal.querySelector('#sar-btn-cancelar-espera').onclick = () => {
                if (visibilityListenerActivo) {
                    document.removeEventListener('visibilitychange', visibilityListenerActivo);
                    visibilityListenerActivo = null;
                }
                contenido.style.display = 'block';
                esperando.style.display = 'none';
            };
        });
    }

    // ================================================================
    // CONEXIÓN WALLETCONNECT (fallback)
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

        if (tieneInjectedProvider() && !esMovil()) {
            return await conectarConInjected();
        }

        if (esNavegadorDeMetaMask() || esNavegadorDeCoinbase()) {
            return await conectarConInjected();
        }

        if (esNavegadorMovilSinWallet()) {
            return await mostrarModalMovil();
        }

        return await mostrarModalMovil();
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
    // INFO DE LA RED ACTUAL (útil para debugging)
    // ================================================================

    function redActual() {
        return {
            nombre: RED_ACTIVA,
            chainId: CHAIN_ID_OBJETIVO,
            chainIdHex: CHAIN_ID_HEX,
            info: RED
        };
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
        esAndroid,
        esIOS,
        esNavegadorDeMetaMask,
        esNavegadorDeCoinbase,
        esNavegadorMovilSinWallet,
        abrirMetaMaskApp,
        abrirRainbowApp,
        redActual
    };

    console.log('✅ SarWallet cargado | Red activa:', RED_ACTIVA, '| Chain ID:', CHAIN_ID_OBJETIVO);
})();