/* ================================================================
 * WALLET CONNECT - Sariel's Ecosystem
 * Versión corregida: 2026-09-26
 * ================================================================ */
(function () {
    'use strict';

    const PUBLIC_APP_URL = 'https://auction.up.railway.app';
    const WEB3_CONFIG_ENDPOINT = '/api/config/web3';

    const RED_ACTIVA = 'AMOY';

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

    let WALLETCONNECT_PROJECT_ID = null;
    let web3ConfigPromise = null;
    let wcProvider = null;
    let currentAccount = null;
    let currentProviderType = null;
    let desconectando = false;
    let eventosInjectedRegistrados = false;
    let eventosWcRegistrados = false;

    function tieneInjectedProvider() {
        return !!(
            window.ethereum &&
            typeof window.ethereum.request === 'function'
        );
    }

    function esMovil() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent || '');
    }

    function esAndroid() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function esIOS() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }

    function esNavegadorDeMetaMask() {
        return (
            tieneInjectedProvider() &&
            window.ethereum.isMetaMask === true
        );
    }

    function esNavegadorDeCoinbase() {
        return (
            tieneInjectedProvider() &&
            window.ethereum.isCoinbaseWallet === true
        );
    }

    function esNavegadorWalletInterno() {
        return (
            esNavegadorDeMetaMask() ||
            esNavegadorDeCoinbase()
        );
    }

    function debeUsarInjected() {
        if (!tieneInjectedProvider()) {
            return false;
        }

        return (
            !esMovil() ||
            esNavegadorWalletInterno()
        );
    }

    async function cargarConfiguracionWeb3() {
        if (WALLETCONNECT_PROJECT_ID) {
            return {
                walletConnectProjectId:
                    WALLETCONNECT_PROJECT_ID,

                publicUrl:
                    PUBLIC_APP_URL,

                polygonChainId:
                    CHAIN_ID_OBJETIVO
            };
        }

        if (web3ConfigPromise) {
            return web3ConfigPromise;
        }

        web3ConfigPromise = (async () => {

            let response;

            try {

                response = await fetch(
                    WEB3_CONFIG_ENDPOINT,
                    {
                        method: 'GET',
                        headers: {
                            Accept:
                                'application/json'
                        },
                        credentials:
                            'same-origin',
                        cache:
                            'no-store'
                    }
                );

            } catch (error) {

                const e =
                    new Error(
                        'WEB3_CONFIG_NETWORK_ERROR'
                    );

                e.cause = error;

                throw e;
            }

            if (!response.ok) {
                throw new Error(
                    'WEB3_CONFIG_HTTP_' +
                    response.status
                );
            }

            let config;

            try {

                config =
                    await response.json();

            } catch (error) {

                throw new Error(
                    'WEB3_CONFIG_INVALID_JSON'
                );

            }

            if (
                !config ||
                config.success !== true
            ) {
                throw new Error(
                    'WEB3_CONFIG_INVALID'
                );
            }

            const projectId =
                String(
                    config.walletConnectProjectId ||
                    ''
                ).trim();

            if (!projectId) {
                throw new Error(
                    'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
                );
            }

            WALLETCONNECT_PROJECT_ID =
                projectId;

            if (
                config.polygonChainId != null &&
                Number(
                    config.polygonChainId
                ) !== CHAIN_ID_OBJETIVO
            ) {

                console.warn(
                    '[SarWallet] Chain ID del backend:',
                    config.polygonChainId,
                    '| esperado:',
                    CHAIN_ID_OBJETIVO
                );

            }

            return {
                walletConnectProjectId:
                    WALLETCONNECT_PROJECT_ID,

                publicUrl:
                    PUBLIC_APP_URL,

                polygonChainId:
                    Number(
                        config.polygonChainId
                    ) ||
                    CHAIN_ID_OBJETIVO
            };

        })().catch((error) => {

            web3ConfigPromise =
                null;

            throw error;

        });

        return web3ConfigPromise;
    }

    function construirDeepLinkMetaMask() {

        let path =
            window.location.pathname +
            window.location.search;

        if (!path) {
            path = '/';
        }

        let canonicalUrl;

        try {

            canonicalUrl =
                new URL(
                    path,
                    PUBLIC_APP_URL
                );

        } catch (_) {

            canonicalUrl =
                new URL(
                    '/',
                    PUBLIC_APP_URL
                );

        }

        return (
            'https://metamask.app.link/dapp/' +
            canonicalUrl.host +
            canonicalUrl.pathname +
            canonicalUrl.search
        );
    }

    function abrirMetaMaskApp() {

        const deepLink =
            construirDeepLinkMetaMask();

        console.log(
            '[SarWallet] Abriendo MetaMask:',
            deepLink
        );

        window.location.href =
            deepLink;
    }

    function abrirRainbowApp() {

        let urlActual;

        try {

            urlActual =
                new URL(
                    window.location.pathname +
                    window.location.search,
                    PUBLIC_APP_URL
                ).toString();

        } catch (_) {

            urlActual =
                PUBLIC_APP_URL;

        }

        const deepLink =
            'https://rnbwapp.com/dapp?url=' +
            encodeURIComponent(
                urlActual
            );

        console.log(
            '[SarWallet] Abriendo Rainbow:',
            deepLink
        );

        window.location.href =
            deepLink;
    }

    function guardarSesion(data) {

        try {

            localStorage.setItem(
                'sar_wallet_session',
                JSON.stringify({

                    tipo:
                        data.tipo,

                    address:
                        data.address,

                    chainId:
                        data.chainId,

                    timestamp:
                        Date.now()

                })
            );

        } catch (error) {

            console.warn(
                '[SarWallet] No se pudo guardar sesión local:',
                error
            );

        }
    }

    function leerSesion() {

        try {

            const raw =
                localStorage.getItem(
                    'sar_wallet_session'
                );

            if (!raw) {
                return null;
            }

            const data =
                JSON.parse(raw);

            if (
                !data ||
                !data.timestamp ||
                Date.now() -
                    data.timestamp >
                    24 * 60 * 60 * 1000
            ) {

                localStorage.removeItem(
                    'sar_wallet_session'
                );

                return null;
            }

            return data;

        } catch (_) {

            return null;

        }
    }

    function limpiarSesion() {

        try {

            localStorage.removeItem(
                'sar_wallet_session'
            );

        } catch (_) {}

    }

    async function cambiarRedInjected() {

        if (!tieneInjectedProvider()) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }

        try {

            await window.ethereum.request({

                method:
                    'wallet_switchEthereumChain',

                params: [{
                    chainId:
                        CHAIN_ID_HEX
                }]

            });

        } catch (switchError) {

            if (
                switchError &&
                switchError.code === 4902
            ) {

                await window.ethereum.request({

                    method:
                        'wallet_addEthereumChain',

                    params: [{

                        chainId:
                            CHAIN_ID_HEX,

                        chainName:
                            RED.name,

                        nativeCurrency: {

                            name:
                                RED.symbol,

                            symbol:
                                RED.symbol,

                            decimals:
                                18

                        },

                        rpcUrls: [
                            RED.rpcUrl
                        ],

                        blockExplorerUrls: [
                            RED.explorer
                        ]

                    }]

                });

            } else {

                throw switchError;

            }
        }
    }

    async function conectarConInjected() {

        if (!tieneInjectedProvider()) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }

        const accounts =
            await window.ethereum.request({

                method:
                    'eth_requestAccounts'

            });

        if (
            !accounts ||
            accounts.length === 0
        ) {

            throw new Error(
                'NO_ACCOUNTS_RETURNED'
            );

        }

        const account =
            accounts[0];

        let chainIdHexActual =
            await window.ethereum.request({

                method:
                    'eth_chainId'

            });

        let chainIdActual =
            parseInt(
                chainIdHexActual,
                16
            );

        if (
            chainIdActual !==
            CHAIN_ID_OBJETIVO
        ) {

            await cambiarRedInjected();

            chainIdHexActual =
                await window.ethereum.request({

                    method:
                        'eth_chainId'

                });

            chainIdActual =
                parseInt(
                    chainIdHexActual,
                    16
                );

            if (
                chainIdActual !==
                CHAIN_ID_OBJETIVO
            ) {

                throw new Error(
                    'WRONG_NETWORK'
                );

            }
        }

        currentAccount =
            account;

        currentProviderType =
            'injected';

        guardarSesion({

            tipo:
                'injected',

            address:
                account,

            chainId:
                CHAIN_ID_OBJETIVO

        });

        registrarEventosInjected();

        return {

            tipo:
                'injected',

            address:
                account,

            chainId:
                CHAIN_ID_OBJETIVO,

            provider:
                window.ethereum

        };
    }

    function registrarEventosInjected() {

        if (
            eventosInjectedRegistrados ||
            !tieneInjectedProvider()
        ) {
            return;
        }

        eventosInjectedRegistrados =
            true;

        window.ethereum.on(
            'accountsChanged',
            (accounts) => {

                if (
                    !accounts ||
                    accounts.length === 0
                ) {

                    currentAccount =
                        null;

                    currentProviderType =
                        null;

                    limpiarSesion();

                    window.dispatchEvent(
                        new CustomEvent(
                            'sar:wallet:disconnected'
                        )
                    );

                    return;
                }

                currentAccount =
                    accounts[0];

                guardarSesion({

                    tipo:
                        'injected',

                    address:
                        accounts[0],

                    chainId:
                        CHAIN_ID_OBJETIVO

                });

                window.dispatchEvent(
                    new CustomEvent(
                        'sar:wallet:accountsChanged',
                        {
                            detail: {
                                address:
                                    accounts[0]
                            }
                        }
                    )
                );
            }
        );

        window.ethereum.on(
            'chainChanged',
            (chainIdHex) => {

                const chainId =
                    parseInt(
                        chainIdHex,
                        16
                    );

                if (
                    chainId !==
                    CHAIN_ID_OBJETIVO
                ) {

                    window.dispatchEvent(
                        new CustomEvent(
                            'sar:wallet:wrongNetwork',
                            {
                                detail: {
                                    chainId,
                                    expectedChainId:
                                        CHAIN_ID_OBJETIVO
                                }
                            }
                        )
                    );

                }

                window.dispatchEvent(
                    new CustomEvent(
                        'sar:wallet:chainChanged',
                        {
                            detail: {
                                chainId
                            }
                        }
                    )
                );
            }
        );
    }

    async function validarSesionInjected() {

        if (!tieneInjectedProvider()) {
            return null;
        }

        try {

            const accounts =
                await window.ethereum.request({

                    method:
                        'eth_accounts'

                });

            if (
                !accounts ||
                accounts.length === 0
            ) {

                return null;

            }

            const chainIdHex =
                await window.ethereum.request({

                    method:
                        'eth_chainId'

                });

            const chainId =
                parseInt(
                    chainIdHex,
                    16
                );

            if (
                chainId !==
                CHAIN_ID_OBJETIVO
            ) {

                return null;

            }

            return {

                address:
                    accounts[0],

                chainId

            };

        } catch (error) {

            console.warn(
                '[SarWallet] No se pudo validar injected:',
                error
            );

            return null;

        }
    }

    async function conectarConWalletConnect() {

        const config =
            await cargarConfiguracionWeb3();

        if (
            !config.walletConnectProjectId
        ) {

            throw new Error(
                'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
            );

        }

        if (wcProvider) {

            try {

                if (
                    typeof wcProvider.disconnect ===
                    'function'
                ) {

                    await wcProvider.disconnect();

                }

            } catch (error) {

                console.warn(
                    '[SarWallet] No se pudo limpiar WalletConnect anterior:',
                    error
                );

            }

            wcProvider =
                null;

            eventosWcRegistrados =
                false;
        }

        let EthereumProvider;

        try {

            const modulo =
                await import(
                    'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'
                );

            EthereumProvider =
                modulo.EthereumProvider;

        } catch (error) {

            console.error(
                '[SarWallet] Error cargando WalletConnect SDK:',
                error
            );

            const e =
                new Error(
                    'WALLETCONNECT_SDK_LOAD_FAILED'
                );

            e.cause = error;

            throw e;
        }

        if (
            typeof EthereumProvider !==
            'function'
        ) {

            throw new Error(
                'WALLETCONNECT_SDK_INVALID'
            );
        }

        wcProvider =
            await EthereumProvider.init({

                projectId:
                    config.walletConnectProjectId,

                chains: [
                    CHAIN_ID_OBJETIVO
                ],

                optionalChains: [
                    CHAIN_ID_OBJETIVO
                ],

                showQrModal:
                    true,

                qrModalOptions: {

                    themeMode:
                        'dark',

                    themeVariables: {

                        '--wcm-z-index':
                            '99999'

                    }

                },

                metadata: {

                    name:
                        "Sariel's",

                    description:
                        "Ecosistema Web3 Csariel's",

                    url:
                        PUBLIC_APP_URL,

                    icons: [
                        PUBLIC_APP_URL +
                        '/favicon.ico'
                    ]

                }

            });

        if (!wcProvider) {

            throw new Error(
                'WALLETCONNECT_PROVIDER_INIT_FAILED'
            );
        }

        await wcProvider.connect();

        const accounts =
            wcProvider.accounts;

        if (
            !accounts ||
            accounts.length === 0
        ) {

            throw new Error(
                'WALLETCONNECT_NO_ACCOUNTS'
            );

        }

        const account =
            accounts[0];

        const chainId =
            Number(
                wcProvider.chainId
            );

        if (
            chainId !==
            CHAIN_ID_OBJETIVO
        ) {

            throw new Error(
                'WRONG_NETWORK'
            );

        }

        currentAccount =
            account;

        currentProviderType =
            'walletconnect';

        guardarSesion({

            tipo:
                'walletconnect',

            address:
                account,

            chainId

        });

        registrarEventosWalletConnect();

        return {

            tipo:
                'walletconnect',

            address:
                account,

            chainId,

            provider:
                wcProvider

        };
    }

    function registrarEventosWalletConnect() {

        if (
            !wcProvider ||
            eventosWcRegistrados
        ) {
            return;
        }

        eventosWcRegistrados =
            true;

        wcProvider.on(
            'accountsChanged',
            (accounts) => {

                if (
                    !accounts ||
                    accounts.length === 0
                ) {

                    limpiarEstadoLocal();

                    window.dispatchEvent(
                        new CustomEvent(
                            'sar:wallet:disconnected'
                        )
                    );

                    return;
                }

                currentAccount =
                    accounts[0];

                guardarSesion({

                    tipo:
                        'walletconnect',

                    address:
                        accounts[0],

                    chainId:
                        Number(
                            wcProvider?.chainId ||
                            CHAIN_ID_OBJETIVO
                        )

                });

                window.dispatchEvent(
                    new CustomEvent(
                        'sar:wallet:accountsChanged',
                        {
                            detail: {
                                address:
                                    accounts[0]
                            }
                        }
                    )
                );
            }
        );

        wcProvider.on(
            'chainChanged',
            (chainId) => {

                const numericChainId =
                    Number(chainId);

                window.dispatchEvent(
                    new CustomEvent(
                        'sar:wallet:chainChanged',
                        {
                            detail: {
                                chainId:
                                    numericChainId
                            }
                        }
                    )
                );

                if (
                    numericChainId !==
                    CHAIN_ID_OBJETIVO
                ) {

                    window.dispatchEvent(
                        new CustomEvent(
                            'sar:wallet:wrongNetwork',
                            {
                                detail: {
                                    chainId:
                                        numericChainId,

                                    expectedChainId:
                                        CHAIN_ID_OBJETIVO
                                }
                            }
                        )
                    );
                }
            }
        );

        wcProvider.on(
            'disconnect',
            () => {

                wcProvider =
                    null;

                eventosWcRegistrados =
                    false;

                currentAccount =
                    null;

                currentProviderType =
                    null;

                limpiarSesion();

                window.dispatchEvent(
                    new CustomEvent(
                        'sar:wallet:disconnected'
                    )
                );
            }
        );
    }

    function limpiarEstadoLocal() {

        currentAccount =
            null;

        currentProviderType =
            null;

        limpiarSesion();

    }

    async function desconectar() {

        if (desconectando) {
            return;
        }

        desconectando =
            true;

        const provider =
            wcProvider;

        wcProvider =
            null;

        eventosWcRegistrados =
            false;

        try {

            if (
                provider &&
                typeof provider.disconnect ===
                'function'
            ) {

                await provider.disconnect();

            }

        } catch (error) {

            console.warn(
                '[SarWallet] Error desconectando WalletConnect:',
                error
            );

        }

        currentAccount =
            null;

        currentProviderType =
            null;

        limpiarSesion();

        window.dispatchEvent(
            new CustomEvent(
                'sar:wallet:disconnected'
            )
        );

        desconectando =
            false;
    }

    async function conectar() {

        if (esMovil()) {

            if (
                esNavegadorWalletInterno()
            ) {

                console.log(
                    '[SarWallet] Móvil dentro de wallet → injected'
                );

                const estado =
                    await validarSesionInjected();

                if (estado) {

                    currentAccount =
                        estado.address;

                    currentProviderType =
                        'injected';

                    guardarSesion({

                        tipo:
                            'injected',

                        address:
                            estado.address,

                        chainId:
                            estado.chainId

                    });

                    registrarEventosInjected();

                    return {

                        tipo:
                            'injected',

                        address:
                            estado.address,

                        chainId:
                            estado.chainId,

                        provider:
                            window.ethereum,

                        reconnected:
                            true
                    };
                }

                return conectarConInjected();
            }

            console.log(
                '[SarWallet] Chrome/Safari móvil → WalletConnect'
            );

            return conectarConWalletConnect();
        }

        if (tieneInjectedProvider()) {

            console.log(
                '[SarWallet] Desktop con injected'
            );

            const estado =
                await validarSesionInjected();

            if (estado) {

                currentAccount =
                    estado.address;

                currentProviderType =
                    'injected';

                guardarSesion({

                    tipo:
                        'injected',

                    address:
                        estado.address,

                    chainId:
                        estado.chainId

                });

                registrarEventosInjected();

                return {

                    tipo:
                        'injected',

                    address:
                        estado.address,

                    chainId:
                        estado.chainId,

                    provider:
                        window.ethereum,

                    reconnected:
                        true
                };
            }

            return conectarConInjected();
        }

        console.log(
            '[SarWallet] Desktop sin injected → WalletConnect'
        );

        return conectarConWalletConnect();
    }

    async function restaurarSesion() {

        const sesion =
            leerSesion();

        if (
            !sesion ||
            !sesion.address
        ) {

            return null;
        }

        if (
            sesion.tipo ===
            'injected'
        ) {

            if (!debeUsarInjected()) {
                return null;
            }

            const estado =
                await validarSesionInjected();

            if (
                !estado ||
                estado.address.toLowerCase() !==
                sesion.address.toLowerCase()
            ) {

                return null;
            }

            currentAccount =
                estado.address;

            currentProviderType =
                'injected';

            registrarEventosInjected();

            return {

                tipo:
                    'injected',

                address:
                    estado.address,

                chainId:
                    estado.chainId,

                provider:
                    window.ethereum
            };
        }

        if (
            sesion.tipo ===
            'walletconnect'
        ) {

            return {

                tipo:
                    'walletconnect',

                address:
                    sesion.address,

                chainId:
                    sesion.chainId,

                provider:
                    wcProvider
            };
        }

        return null;
    }

    function obtenerProvider() {

        if (
            currentProviderType ===
            'injected'
        ) {

            return window.ethereum;
        }

        if (
            currentProviderType ===
            'walletconnect'
        ) {

            return wcProvider;
        }

        return null;
    }

    function obtenerCuenta() {
        return currentAccount;
    }

    function obtenerTipoProvider() {
        return currentProviderType;
    }

    function redActual() {

        return {

            nombre:
                RED_ACTIVA,

            chainId:
                CHAIN_ID_OBJETIVO,

            chainIdHex:
                CHAIN_ID_HEX,

            info:
                RED
        };
    }

    function obtenerConfiguracion() {

        return {

            publicUrl:
                PUBLIC_APP_URL,

            walletConnectConfigured:
                Boolean(
                    WALLETCONNECT_PROJECT_ID
                ),

            chainId:
                CHAIN_ID_OBJETIVO,

            chainIdHex:
                CHAIN_ID_HEX,

            network:
                RED.name
        };
    }

    window.SarWallet = {

        conectar,

        desconectar,

        obtenerProvider,

        obtenerCuenta,

        obtenerTipoProvider,

        obtenerConfiguracion,

        restaurarSesion,

        tieneInjectedProvider,

        debeUsarInjected,

        esMovil,

        esAndroid,

        esIOS,

        esNavegadorDeMetaMask,

        esNavegadorDeCoinbase,

        esNavegadorWalletInterno,

        abrirMetaMaskApp,

        abrirRainbowApp,

        redActual
    };

    console.log(
        '[SarWallet] cargado | URL:',
        PUBLIC_APP_URL,
        '| red:',
        RED_ACTIVA,
        '| chainId:',
        CHAIN_ID_OBJETIVO,
        '| móvil:',
        esMovil(),
        '| injected:',
        tieneInjectedProvider()
    );

})();