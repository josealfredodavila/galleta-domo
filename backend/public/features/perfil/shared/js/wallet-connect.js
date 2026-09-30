/* ================================================================
 * WALLET CONNECT - Sariel's Ecosystem
 * ================================================================
 * v3.0.0 - 30/09/2026
 *
 * FIX CRÍTICO:
 * - WalletConnect NO publica bundle UMD. Usar esm.sh (más confiable
 *   que jsdelivr +esm que fallaba silenciosamente en móvil).
 * - Timeout extendido a 20s con retry.
 * - Fallback a jsdelivr +esm si esm.sh falla.
 * ================================================================ */

(function () {
    'use strict';

    const DEFAULT_PUBLIC_APP_URL = 'https://galleta-domo-production.up.railway.app';
    const WEB3_CONFIG_ENDPOINT = '/api/config/web3';
    const RED_ACTIVA = 'AMOY';

    const REDES = {
        MAINNET: {
            chainId: 137, chainIdHex: '0x89',
            name: 'Polygon Mainnet',
            rpcUrl: 'https://polygon-rpc.com',
            explorer: 'https://polygonscan.com',
            symbol: 'POL'
        },
        AMOY: {
            chainId: 80002, chainIdHex: '0x13882',
            name: 'Polygon Amoy',
            rpcUrl: 'https://rpc-amoy.polygon.technology/',
            explorer: 'https://amoy.polygonscan.com',
            symbol: 'POL'
        }
    };

    const RED = REDES[RED_ACTIVA];
    const CHAIN_ID_OBJETIVO = RED.chainId;
    const CHAIN_ID_HEX = RED.chainIdHex;

    let WALLETCONNECT_PROJECT_ID = null;
    let PUBLIC_APP_URL = DEFAULT_PUBLIC_APP_URL;
    let web3ConfigPromise = null;
    let wcProvider = null;
    let currentAccount = null;
    let currentProviderType = null;
    let desconectando = false;
    let eventosInjectedRegistrados = false;
    let eventosWcRegistrados = false;

    function normalizarAddress(a) { return String(a || '').trim(); }
    function esAddressValida(a) { return /^0x[a-fA-F0-9]{40}$/.test(normalizarAddress(a)); }

    function obtenerChainIdNumerico(chainId) {
        if (typeof chainId === 'number') return chainId;
        if (typeof chainId === 'string') {
            if (chainId.startsWith('0x')) return parseInt(chainId, 16);
            return Number(chainId);
        }
        return Number(chainId);
    }

    function obtenerErrorCode(error) {
        if (!error) return '';
        if (error.code !== undefined && error.code !== null) return String(error.code);
        if (error.data && error.data.code !== undefined) return String(error.data.code);
        return String(error.message || '');
    }

    function errorUsuarioCancelo(error) {
        const code = obtenerErrorCode(error);
        return code === '4001' || code === 'USER_REJECTED' || code === 'USER_CANCELLED';
    }

    function obtenerInjectedProvider() {
        if (!window.ethereum) return null;
        if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length) {
            const metamask = window.ethereum.providers.find(p => p && p.isMetaMask === true);
            if (metamask) return metamask;
            const coinbase = window.ethereum.providers.find(p => p && p.isCoinbaseWallet === true);
            if (coinbase) return coinbase;
            return window.ethereum.providers[0] || null;
        }
        return window.ethereum;
    }

    function tieneInjectedProvider() {
        const p = obtenerInjectedProvider();
        return Boolean(p && typeof p.request === 'function');
    }

    function esMovil() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }

    function esAndroid() { return /Android/i.test(navigator.userAgent || ''); }
    function esIOS() { return /iPhone|iPad|iPod/i.test(navigator.userAgent || ''); }

    function esNavegadorDeMetaMask() {
        const p = obtenerInjectedProvider();
        return Boolean(p && p.isMetaMask === true && esMovil());
    }

    function esNavegadorDeCoinbase() {
        const p = obtenerInjectedProvider();
        return Boolean(p && p.isCoinbaseWallet === true);
    }

    function esNavegadorWalletInterno() {
        return esNavegadorDeMetaMask() || esNavegadorDeCoinbase();
    }

    function debeUsarInjected() {
        if (!tieneInjectedProvider()) return false;
        return !esMovil() || esNavegadorWalletInterno();
    }

    async function cargarConfiguracionWeb3() {
        if (WALLETCONNECT_PROJECT_ID) {
            return {
                walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
                publicUrl: PUBLIC_APP_URL,
                polygonChainId: CHAIN_ID_OBJETIVO
            };
        }
        if (web3ConfigPromise) return web3ConfigPromise;

        web3ConfigPromise = (async function () {
            let response;
            try {
                response = await fetch(WEB3_CONFIG_ENDPOINT, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    cache: 'no-store'
                });
            } catch (error) {
                const e = new Error('WEB3_CONFIG_NETWORK_ERROR');
                e.cause = error;
                throw e;
            }
            if (!response.ok) throw new Error('WEB3_CONFIG_HTTP_' + response.status);
            let config;
            try { config = await response.json(); }
            catch (error) { throw new Error('WEB3_CONFIG_INVALID_JSON'); }
            if (!config || config.success !== true) throw new Error('WEB3_CONFIG_INVALID');
            const projectId = String(config.walletConnectProjectId || '').trim();
            if (!projectId) throw new Error('WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED');
            WALLETCONNECT_PROJECT_ID = projectId;
            if (config.publicUrl) {
                try {
                    const url = new URL(String(config.publicUrl));
                    PUBLIC_APP_URL = url.origin;
                } catch (_) { PUBLIC_APP_URL = DEFAULT_PUBLIC_APP_URL; }
            }
            const serverChainId = Number(config.polygonChainId);
            return {
                walletConnectProjectId: WALLETCONNECT_PROJECT_ID,
                publicUrl: PUBLIC_APP_URL,
                polygonChainId: Number.isFinite(serverChainId) ? serverChainId : CHAIN_ID_OBJETIVO
            };
        })().catch(function (error) {
            web3ConfigPromise = null;
            throw error;
        });

        return web3ConfigPromise;
    }

    function obtenerURLActualParaWallet() {
        try {
            const base = PUBLIC_APP_URL || window.location.origin;
            return new URL(window.location.pathname + window.location.search + window.location.hash, base);
        } catch (_) {
            return new URL('/', DEFAULT_PUBLIC_APP_URL);
        }
    }

    function construirDeepLinkMetaMask() {
        const url = obtenerURLActualParaWallet();
        return 'https://metamask.app.link/dapp/' + url.host + url.pathname + url.search + url.hash;
    }

    function abrirMetaMaskApp() {
        const deepLink = construirDeepLinkMetaMask();
        try { window.location.assign(deepLink); } catch (error) { window.location.href = deepLink; }
        return deepLink;
    }

    function abrirRainbowApp() {
        let urlActual;
        try { urlActual = obtenerURLActualParaWallet().toString(); }
        catch (_) { urlActual = PUBLIC_APP_URL; }
        const deepLink = 'https://rnbwapp.com/dapp?url=' + encodeURIComponent(urlActual);
        try { window.location.assign(deepLink); } catch (error) { window.location.href = deepLink; }
        return deepLink;
    }

    function guardarSesion(data) {
        try {
            localStorage.setItem('sar_wallet_session', JSON.stringify({
                tipo: data.tipo,
                address: data.address,
                chainId: data.chainId,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('[SarWallet] No se pudo guardar sesión:', error);
        }
    }

    function leerSesion() {
        try {
            const raw = localStorage.getItem('sar_wallet_session');
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.timestamp) { localStorage.removeItem('sar_wallet_session'); return null; }
            const edad = Date.now() - Number(data.timestamp);
            if (edad > 24 * 60 * 60 * 1000) { localStorage.removeItem('sar_wallet_session'); return null; }
            if (!esAddressValida(data.address)) { localStorage.removeItem('sar_wallet_session'); return null; }
            return data;
        } catch (_) { return null; }
    }

    function limpiarSesion() {
        try { localStorage.removeItem('sar_wallet_session'); } catch (_) {}
    }

    async function cambiarRedInjected() {
        const provider = obtenerInjectedProvider();
        if (!provider) throw new Error('INJECTED_NOT_AVAILABLE');
        try {
            await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
        } catch (switchError) {
            const code = Number(switchError && switchError.code);
            if (code === 4902) {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: CHAIN_ID_HEX,
                        chainName: RED.name,
                        nativeCurrency: { name: RED.symbol, symbol: RED.symbol, decimals: 18 },
                        rpcUrls: [RED.rpcUrl],
                        blockExplorerUrls: [RED.explorer]
                    }]
                });
            } else throw switchError;
        }
    }

    async function conectarConInjected() {
        const provider = obtenerInjectedProvider();
        if (!provider) throw new Error('INJECTED_NOT_AVAILABLE');

        let accounts;
        try {
            accounts = await provider.request({ method: 'eth_requestAccounts' });
        } catch (error) {
            if (errorUsuarioCancelo(error)) {
                const e = new Error('USER_REJECTED'); e.cause = error; throw e;
            }
            throw error;
        }
        if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('NO_ACCOUNTS_RETURNED');
        const account = normalizarAddress(accounts[0]);
        if (!esAddressValida(account)) throw new Error('INVALID_WALLET_ADDRESS');

        let chainIdHexActual = await provider.request({ method: 'eth_chainId' });
        let chainIdActual = obtenerChainIdNumerico(chainIdHexActual);

        if (chainIdActual !== CHAIN_ID_OBJETIVO) {
            await cambiarRedInjected();
            chainIdHexActual = await provider.request({ method: 'eth_chainId' });
            chainIdActual = obtenerChainIdNumerico(chainIdHexActual);
            if (chainIdActual !== CHAIN_ID_OBJETIVO) throw new Error('WRONG_NETWORK');
        }

        currentAccount = account;
        currentProviderType = 'injected';
        guardarSesion({ tipo: 'injected', address: account, chainId: CHAIN_ID_OBJETIVO });
        registrarEventosInjected();
        window.dispatchEvent(new CustomEvent('sar:wallet:connected', { detail: { address: account, chainId: CHAIN_ID_OBJETIVO, tipo: 'injected' } }));

        return { tipo: 'injected', address: account, chainId: CHAIN_ID_OBJETIVO, provider: provider };
    }

    async function validarSesionInjected() {
        const provider = obtenerInjectedProvider();
        if (!provider) return null;
        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (!Array.isArray(accounts) || accounts.length === 0) return null;
            const address = normalizarAddress(accounts[0]);
            if (!esAddressValida(address)) return null;
            const chainIdHex = await provider.request({ method: 'eth_chainId' });
            const chainId = obtenerChainIdNumerico(chainIdHex);
            if (chainId !== CHAIN_ID_OBJETIVO) return null;
            return { address, chainId, provider };
        } catch (error) {
            console.warn('[SarWallet] Error validando injected:', error);
            return null;
        }
    }

    function registrarEventosInjected() {
        const provider = obtenerInjectedProvider();
        if (eventosInjectedRegistrados || !provider || typeof provider.on !== 'function') return;
        eventosInjectedRegistrados = true;
        provider.on('accountsChanged', function (accounts) {
            if (!Array.isArray(accounts) || accounts.length === 0) {
                currentAccount = null; currentProviderType = null; limpiarSesion();
                window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
                return;
            }
            const address = normalizarAddress(accounts[0]);
            currentAccount = address;
            guardarSesion({ tipo: 'injected', address, chainId: CHAIN_ID_OBJETIVO });
            window.dispatchEvent(new CustomEvent('sar:wallet:accountsChanged', { detail: { address } }));
        });
        provider.on('chainChanged', function (chainIdHex) {
            const chainId = obtenerChainIdNumerico(chainIdHex);
            window.dispatchEvent(new CustomEvent('sar:wallet:chainChanged', { detail: { chainId } }));
            if (chainId !== CHAIN_ID_OBJETIVO) {
                window.dispatchEvent(new CustomEvent('sar:wallet:wrongNetwork', { detail: { chainId, expectedChainId: CHAIN_ID_OBJETIVO } }));
            }
        });
        try {
            provider.on('disconnect', function () {
                currentAccount = null; currentProviderType = null; limpiarSesion();
                window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
            });
        } catch (_) {}
    }

    async function destruirWalletConnectAnterior() {
        const provider = wcProvider;
        wcProvider = null;
        eventosWcRegistrados = false;
        if (!provider) return;
        try { if (typeof provider.removeAllListeners === 'function') provider.removeAllListeners(); }
        catch (e) { console.warn('[SarWallet] No se pudo limpiar listeners WC:', e); }
        try { if (typeof provider.disconnect === 'function') await provider.disconnect(); }
        catch (e) { console.warn('[SarWallet] No se pudo desconectar WC anterior:', e); }
    }

    /* ============================================================
       ✅ FIX CRÍTICO v3.0.0:
       - WalletConnect NO publica bundle UMD oficial.
       - Usar esm.sh (más confiable que jsdelivr +esm).
       - Fallback: intentar jsdelivr +esm si esm.sh falla.
       ============================================================ */
    let EthereumProviderPromise = null;

    async function cargarEthereumProvider() {
        if (EthereumProviderPromise) return EthereumProviderPromise;

        EthereumProviderPromise = (async function () {
            console.log('[SarWallet] Cargando WalletConnect SDK (v3)...');

            // Opción 1: ESM via esm.sh (más confiable)
            const urls = [
                'https://esm.sh/@walletconnect/ethereum-provider@2.17.0',
                'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/+esm'
            ];

            let ultimoError = null;

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                try {
                    console.log('[SarWallet] Intentando cargar desde:', url);

                    const modulo = await import(/* @vite-ignore */ url);
                    const Provider = modulo.EthereumProvider || modulo.default || modulo;

                    if (Provider && typeof Provider.init === 'function') {
                        console.log('[SarWallet] ✅ SDK cargado desde:', url);
                        return Provider;
                    }

                    console.warn('[SarWallet] SDK no expone init() en:', url);
                    ultimoError = new Error('WALLETCONNECT_SDK_INVALID');

                } catch (error) {
                    console.warn('[SarWallet] Falló carga desde:', url, error.message);
                    ultimoError = error;
                }
            }

            console.error('[SarWallet] ❌ No se pudo cargar el SDK desde ningún CDN');
            throw ultimoError || new Error('WALLETCONNECT_SDK_LOAD_FAILED');
        })().catch(function (error) {
            EthereumProviderPromise = null;
            throw error;
        });

        return EthereumProviderPromise;
    }

    async function conectarConWalletConnect() {
        console.log('[SarWallet] 🚀 Iniciando conexión WalletConnect...');

        const config = await cargarConfiguracionWeb3();
        console.log('[SarWallet] Config OK, projectId:', config.walletConnectProjectId ? 'presente' : 'FALTA');

        if (!config.walletConnectProjectId) throw new Error('WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED');

        await destruirWalletConnectAnterior();

        const EthereumProvider = await cargarEthereumProvider();
        console.log('[SarWallet] SDK listo, inicializando provider...');

        try {
            wcProvider = await EthereumProvider.init({
                projectId: config.walletConnectProjectId,
                chains: [CHAIN_ID_OBJETIVO],
                optionalChains: [CHAIN_ID_OBJETIVO],
                showQrModal: true,
                qrModalOptions: {
                    themeMode: 'dark',
                    themeVariables: { '--wcm-z-index': '2147483647' }
                },
                metadata: {
                    name: "Sariel's Ecosystem",
                    description: "Ecosistema Web3 Csariel's",
                    url: config.publicUrl || PUBLIC_APP_URL,
                    icons: [(config.publicUrl || PUBLIC_APP_URL) + '/favicon.ico']
                }
            });
            console.log('[SarWallet] ✅ Provider inicializado');
        } catch (error) {
            console.error('[SarWallet] ❌ Error init:', error);
            const e = new Error('WALLETCONNECT_PROVIDER_INIT_FAILED');
            e.cause = error;
            throw e;
        }

        if (!wcProvider) throw new Error('WALLETCONNECT_PROVIDER_INIT_FAILED');

        console.log('[SarWallet] Abriendo modal de WalletConnect...');
        try {
            if (typeof wcProvider.connect === 'function') await wcProvider.connect();
            else if (typeof wcProvider.enable === 'function') await wcProvider.enable();
            else throw new Error('WALLETCONNECT_NO_CONNECT_METHOD');
        } catch (error) {
            if (errorUsuarioCancelo(error)) {
                const e = new Error('USER_CANCELLED'); e.cause = error; throw e;
            }
            throw error;
        }

        const accounts = Array.isArray(wcProvider.accounts) ? wcProvider.accounts : [];
        if (accounts.length === 0) throw new Error('WALLETCONNECT_NO_ACCOUNTS');

        const account = normalizarAddress(accounts[0]);
        if (!esAddressValida(account)) throw new Error('INVALID_WALLET_ADDRESS');

        const chainId = obtenerChainIdNumerico(wcProvider.chainId);
        if (chainId !== CHAIN_ID_OBJETIVO) throw new Error('WRONG_NETWORK');

        currentAccount = account;
        currentProviderType = 'walletconnect';
        guardarSesion({ tipo: 'walletconnect', address: account, chainId });
        registrarEventosWalletConnect();
        window.dispatchEvent(new CustomEvent('sar:wallet:connected', { detail: { address: account, chainId, tipo: 'walletconnect' } }));

        return { tipo: 'walletconnect', address: account, chainId, provider: wcProvider };
    }

    function registrarEventosWalletConnect() {
        if (!wcProvider || eventosWcRegistrados || typeof wcProvider.on !== 'function') return;
        eventosWcRegistrados = true;
        wcProvider.on('accountsChanged', function (accounts) {
            if (!Array.isArray(accounts) || accounts.length === 0) {
                limpiarEstadoLocal();
                window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
                return;
            }
            const address = normalizarAddress(accounts[0]);
            currentAccount = address;
            guardarSesion({ tipo: 'walletconnect', address, chainId: obtenerChainIdNumerico((wcProvider && wcProvider.chainId) || CHAIN_ID_OBJETIVO) });
            window.dispatchEvent(new CustomEvent('sar:wallet:accountsChanged', { detail: { address } }));
        });
        wcProvider.on('chainChanged', function (chainId) {
            const numericChainId = obtenerChainIdNumerico(chainId);
            window.dispatchEvent(new CustomEvent('sar:wallet:chainChanged', { detail: { chainId: numericChainId } }));
            if (numericChainId !== CHAIN_ID_OBJETIVO) {
                window.dispatchEvent(new CustomEvent('sar:wallet:wrongNetwork', { detail: { chainId: numericChainId, expectedChainId: CHAIN_ID_OBJETIVO } }));
            }
        });
        wcProvider.on('disconnect', function () {
            wcProvider = null; eventosWcRegistrados = false;
            currentAccount = null; currentProviderType = null;
            limpiarSesion();
            window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
        });
    }

    function cerrarSelectorWallet(modal, reject) {
        if (modal && modal.parentNode) modal.remove();
        if (reject) reject(new Error('USER_CANCELLED'));
    }

    function seleccionarConexion() {
        return new Promise(function (resolve, reject) {
            const modal = document.createElement('div');
            modal.id = 'sar-wallet-selector';
            modal.style.cssText = `
                position:fixed; inset:0; z-index:2147483647;
                background:rgba(3,7,15,.94); backdrop-filter:blur(14px);
                display:flex; align-items:center; justify-content:center;
                padding:18px; box-sizing:border-box;
            `;

            modal.innerHTML = `
                <div style="width:min(430px,100%); max-height:90vh; overflow:auto;
                    background:linear-gradient(145deg, #0b1625, #07110e);
                    border:1px solid rgba(0,229,255,.35); border-radius:24px;
                    padding:22px; box-shadow:0 25px 80px rgba(0,0,0,.65);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px;">
                        <div>
                            <div style="color:#00e5ff; font-family:Orbitron,monospace; font-size:1rem; font-weight:900;">CONECTAR WALLET</div>
                            <div style="color:#8ca3b8; font-size:.72rem; margin-top:5px;">Polygon Amoy · Chain 80002</div>
                        </div>
                        <button type="button" id="sar-wallet-selector-close" style="border:0; background:rgba(255,255,255,.06); color:#fff; width:38px; height:38px; border-radius:50%; font-size:1.2rem; cursor:pointer;">×</button>
                    </div>
                    <button type="button" id="sar-connect-metamask" style="width:100%; border:0; border-radius:15px; padding:15px; margin:6px 0; background:linear-gradient(135deg, #f6851b, #d85f00); color:#fff; font-weight:800; font-size:.9rem; cursor:pointer;">🦊 MetaMask</button>
                    <button type="button" id="sar-connect-walletconnect" style="width:100%; border:0; border-radius:15px; padding:15px; margin:6px 0; background:linear-gradient(135deg, #3b99fc, #246ac4); color:#fff; font-weight:800; font-size:.9rem; cursor:pointer;">🔗 WalletConnect</button>
                    <button type="button" id="sar-connect-coinbase" style="width:100%; border:0; border-radius:15px; padding:15px; margin:6px 0; background:linear-gradient(135deg, #2457ff, #173aa7); color:#fff; font-weight:800; font-size:.9rem; cursor:pointer;">🔷 Coinbase Wallet</button>
                    <button type="button" id="sar-connect-rainbow" style="width:100%; border:0; border-radius:15px; padding:15px; margin:6px 0; background:linear-gradient(135deg, #7c3aed, #ec4899); color:#fff; font-weight:800; font-size:.9rem; cursor:pointer;">🌈 Rainbow</button>
                    <div style="margin-top:16px; padding:12px; border-radius:12px; background:rgba(255,255,255,.04); color:#7f96ab; font-size:.68rem; line-height:1.5; text-align:center;">
                        Se abrirá WalletConnect para que elijas tu wallet. Funciona con MetaMask, Rainbow, Coinbase y muchas más.
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cerrar = function () { cerrarSelectorWallet(modal, reject); };
            const closeButton = modal.querySelector('#sar-wallet-selector-close');
            if (closeButton) closeButton.onclick = cerrar;
            modal.addEventListener('click', function (event) {
                if (event.target === modal) cerrar();
            });

            const metamaskButton = modal.querySelector('#sar-connect-metamask');
            if (metamaskButton) {
                metamaskButton.onclick = async function () {
                    const btn = this;
                    try {
                        btn.disabled = true;
                        btn.textContent = '⏳ Abriendo WalletConnect...';
                        if (esNavegadorDeMetaMask()) {
                            const result = await conectarConInjected();
                            modal.remove(); resolve(result); return;
                        }
                        if (esMovil()) {
                            const result = await conectarConWalletConnect();
                            modal.remove(); resolve(result); return;
                        }
                        if (tieneInjectedProvider()) {
                            const result = await conectarConInjected();
                            modal.remove(); resolve(result); return;
                        }
                        const result = await conectarConWalletConnect();
                        modal.remove(); resolve(result);
                    } catch (error) {
                        console.error('[SarWallet] MetaMask:', error);
                        btn.disabled = false;
                        btn.textContent = '🦊 MetaMask';
                        if (error && error.message === 'USER_CANCELLED') return;
                        alert(obtenerMensajeError(error));
                    }
                };
            }

            const walletConnectButton = modal.querySelector('#sar-connect-walletconnect');
            if (walletConnectButton) {
                walletConnectButton.onclick = async function () {
                    const btn = this;
                    try {
                        btn.disabled = true;
                        btn.textContent = '⏳ Abriendo WalletConnect...';
                        const result = await conectarConWalletConnect();
                        modal.remove(); resolve(result);
                    } catch (error) {
                        console.error('[SarWallet] WalletConnect:', error);
                        btn.disabled = false;
                        btn.textContent = '🔗 WalletConnect';
                        if (error && error.message === 'USER_CANCELLED') return;
                        alert(obtenerMensajeError(error));
                    }
                };
            }

            const coinbaseButton = modal.querySelector('#sar-connect-coinbase');
            if (coinbaseButton) {
                coinbaseButton.onclick = async function () {
                    const btn = this;
                    try {
                        btn.disabled = true;
                        btn.textContent = '⏳ Abriendo WalletConnect...';
                        if (esNavegadorDeCoinbase()) {
                            const result = await conectarConInjected();
                            modal.remove(); resolve(result); return;
                        }
                        const result = await conectarConWalletConnect();
                        modal.remove(); resolve(result);
                    } catch (error) {
                        console.error('[SarWallet] Coinbase:', error);
                        btn.disabled = false;
                        btn.textContent = '🔷 Coinbase Wallet';
                        if (error && error.message === 'USER_CANCELLED') return;
                        alert(obtenerMensajeError(error));
                    }
                };
            }

            const rainbowButton = modal.querySelector('#sar-connect-rainbow');
            if (rainbowButton) {
                rainbowButton.onclick = async function () {
                    const btn = this;
                    try {
                        btn.disabled = true;
                        btn.textContent = '⏳ Abriendo...';
                        if (esMovil()) {
                            const result = await conectarConWalletConnect();
                            modal.remove(); resolve(result); return;
                        }
                        const deepLink = abrirRainbowApp();
                        modal.remove();
                        resolve({ openedApp: true, tipo: 'rainbow-deeplink', deepLink });
                    } catch (error) {
                        console.error('[SarWallet] Rainbow:', error);
                        btn.disabled = false;
                        btn.textContent = '🌈 Rainbow';
                        if (error && error.message === 'USER_CANCELLED') return;
                        alert(obtenerMensajeError(error));
                    }
                };
            }
        });
    }

    function obtenerMensajeError(error) {
        const code = obtenerErrorCode(error);
        const mensajes = {
            WEB3_CONFIG_NETWORK_ERROR: 'No se pudo contactar el servidor para cargar WalletConnect.',
            WEB3_CONFIG_HTTP_400: 'El servidor rechazó la configuración Web3.',
            WEB3_CONFIG_HTTP_401: 'La configuración Web3 requiere autorización.',
            WEB3_CONFIG_HTTP_403: 'El servidor bloqueó la configuración Web3.',
            WEB3_CONFIG_HTTP_404: 'El endpoint /api/config/web3 no está disponible.',
            WEB3_CONFIG_HTTP_500: 'El servidor devolvió un error de configuración Web3.',
            WEB3_CONFIG_INVALID: 'La configuración Web3 del servidor no es válida.',
            WEB3_CONFIG_INVALID_JSON: 'El servidor devolvió una configuración Web3 inválida.',
            WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED: 'WalletConnect no está configurado en el servidor.',
            WALLETCONNECT_SDK_LOAD_FAILED: 'No se pudo cargar WalletConnect. Comprueba tu conexión.',
            WALLETCONNECT_SDK_TIMEOUT: 'WalletConnect tardó demasiado en cargar. Revisa tu conexión.',
            WALLETCONNECT_SDK_INVALID: 'WalletConnect devolvió una respuesta inválida.',
            WALLETCONNECT_PROVIDER_INIT_FAILED: 'No se pudo inicializar WalletConnect.',
            WALLETCONNECT_NO_ACCOUNTS: 'La wallet no devolvió ninguna cuenta.',
            WALLETCONNECT_NO_CONNECT_METHOD: 'WalletConnect no soporta el método de conexión.',
            NO_ACCOUNTS_RETURNED: 'La wallet no devolvió ninguna cuenta.',
            INVALID_WALLET_ADDRESS: 'La wallet devolvió una dirección inválida.',
            INJECTED_NOT_AVAILABLE: 'No se encontró una wallet instalada en este navegador.',
            WRONG_NETWORK: 'La wallet debe estar conectada a Polygon Amoy.',
            USER_REJECTED: 'Cancelaste la solicitud desde la wallet.',
            USER_CANCELLED: 'Cancelaste la conexión.',
            '4001': 'Cancelaste la solicitud desde la wallet.',
            '4902': 'Polygon Amoy no está disponible en la wallet.'
        };
        return mensajes[code] || mensajes[String((error && error.code) || '')] || (error && error.message) || 'No se pudo conectar la wallet.';
    }

    async function conectar() {
        if (esMovil() && esNavegadorWalletInterno()) {
            const estado = await validarSesionInjected();
            if (estado) {
                currentAccount = estado.address;
                currentProviderType = 'injected';
                guardarSesion({ tipo: 'injected', address: estado.address, chainId: estado.chainId });
                registrarEventosInjected();
                return { tipo: 'injected', address: estado.address, chainId: estado.chainId, provider: estado.provider, reconnected: true };
            }
            return conectarConInjected();
        }
        if (esMovil()) return conectarConWalletConnect();
        if (tieneInjectedProvider()) {
            const estado = await validarSesionInjected();
            if (estado) {
                currentAccount = estado.address;
                currentProviderType = 'injected';
                guardarSesion({ tipo: 'injected', address: estado.address, chainId: estado.chainId });
                registrarEventosInjected();
                return { tipo: 'injected', address: estado.address, chainId: estado.chainId, provider: estado.provider, reconnected: true };
            }
            return conectarConInjected();
        }
        return conectarConWalletConnect();
    }

    async function restaurarSesion() {
        const sesion = leerSesion();
        if (!sesion || !sesion.address) return null;
        if (sesion.tipo === 'injected') {
            if (!debeUsarInjected()) return null;
            const estado = await validarSesionInjected();
            if (!estado || estado.address.toLowerCase() !== sesion.address.toLowerCase()) return null;
            currentAccount = estado.address;
            currentProviderType = 'injected';
            registrarEventosInjected();
            return { tipo: 'injected', address: estado.address, chainId: estado.chainId, provider: estado.provider };
        }
        if (sesion.tipo === 'walletconnect') {
            if (wcProvider && Array.isArray(wcProvider.accounts) && wcProvider.accounts.length) {
                const account = normalizarAddress(wcProvider.accounts[0]);
                const chainId = obtenerChainIdNumerico(wcProvider.chainId);
                if (esAddressValida(account) && chainId === CHAIN_ID_OBJETIVO) {
                    currentAccount = account;
                    currentProviderType = 'walletconnect';
                    registrarEventosWalletConnect();
                    return { tipo: 'walletconnect', address: account, chainId, provider: wcProvider };
                }
            }
            return null;
        }
        return null;
    }

    function limpiarEstadoLocal() {
        currentAccount = null;
        currentProviderType = null;
        limpiarSesion();
    }

    async function desconectar() {
        if (desconectando) return;
        desconectando = true;
        const provider = wcProvider;
        wcProvider = null;
        eventosWcRegistrados = false;
        try { if (provider && typeof provider.removeAllListeners === 'function') provider.removeAllListeners(); }
        catch (e) { console.warn('[SarWallet] No se pudo limpiar listeners:', e); }
        try { if (provider && typeof provider.disconnect === 'function') await provider.disconnect(); }
        catch (error) { console.warn('[SarWallet] Error desconectando WalletConnect:', error); }
        currentAccount = null;
        currentProviderType = null;
        limpiarSesion();
        window.dispatchEvent(new CustomEvent('sar:wallet:disconnected'));
        desconectando = false;
    }

    function obtenerProvider() {
        if (currentProviderType === 'injected') return obtenerInjectedProvider();
        if (currentProviderType === 'walletconnect') return wcProvider;
        return null;
    }
    function obtenerCuenta() { return currentAccount; }
    function obtenerTipoProvider() { return currentProviderType; }
    function redActual() {
        return { nombre: RED_ACTIVA, chainId: CHAIN_ID_OBJETIVO, chainIdHex: CHAIN_ID_HEX, info: RED };
    }
    function obtenerConfiguracion() {
        return {
            publicUrl: PUBLIC_APP_URL,
            walletConnectConfigured: Boolean(WALLETCONNECT_PROJECT_ID),
            chainId: CHAIN_ID_OBJETIVO,
            chainIdHex: CHAIN_ID_HEX,
            network: RED.name,
            explorer: RED.explorer
        };
    }

    window.SarWallet = {
        conectar, seleccionarConexion, desconectar, obtenerProvider, obtenerCuenta,
        obtenerTipoProvider, obtenerConfiguracion, restaurarSesion,
        tieneInjectedProvider, debeUsarInjected, esMovil, esAndroid, esIOS,
        esNavegadorDeMetaMask, esNavegadorDeCoinbase, esNavegadorWalletInterno,
        abrirMetaMaskApp, abrirRainbowApp, redActual
    };

    console.log('[SarWallet] cargado v3', '| red:', RED_ACTIVA, '| chainId:', CHAIN_ID_OBJETIVO, '| móvil:', esMovil(), '| injected:', tieneInjectedProvider());
})();