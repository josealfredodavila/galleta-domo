/* ================================================================
 * WALLET CONNECT - Sariel's Ecosystem
 * ================================================================
 * Conexión Web3 universal:
 *
 * Desktop:
 *   - MetaMask / injected
 *   - WalletConnect
 *
 * Android / iOS:
 *   - MetaMask Browser / Coinbase Browser → injected
 *   - Chrome / Safari → selector
 *   - MetaMask → deep link
 *   - Rainbow → deep link
 *   - Coinbase → WalletConnect
 *
 * Red activa:
 *   Polygon Amoy
 *   Chain ID 80002
 *
 * ================================================================ */

(function () {

    'use strict';


    /* ============================================================
     * CONFIGURACIÓN
     * ============================================================ */

    const DEFAULT_PUBLIC_APP_URL =
        'https://auction.up.railway.app';

    const WEB3_CONFIG_ENDPOINT =
        '/api/config/web3';

    const RED_ACTIVA =
        'AMOY';


    const REDES = {

        MAINNET: {

            chainId: 137,

            chainIdHex: '0x89',

            name: 'Polygon Mainnet',

            rpcUrl:
                'https://polygon-rpc.com',

            explorer:
                'https://polygonscan.com',

            symbol: 'POL'

        },


        AMOY: {

            chainId: 80002,

            chainIdHex: '0x13882',

            name: 'Polygon Amoy',

            rpcUrl:
                'https://rpc-amoy.polygon.technology/',

            explorer:
                'https://amoy.polygonscan.com',

            symbol: 'POL'

        }

    };


    const RED =
        REDES[RED_ACTIVA];


    const CHAIN_ID_OBJETIVO =
        RED.chainId;


    const CHAIN_ID_HEX =
        RED.chainIdHex;


    /* ============================================================
     * ESTADO
     * ============================================================ */

    let WALLETCONNECT_PROJECT_ID =
        null;


    let PUBLIC_APP_URL =
        DEFAULT_PUBLIC_APP_URL;


    let web3ConfigPromise =
        null;


    let wcProvider =
        null;


    let currentAccount =
        null;


    let currentProviderType =
        null;


    let desconectando =
        false;


    let eventosInjectedRegistrados =
        false;


    let eventosWcRegistrados =
        false;


    /* ============================================================
     * UTILIDADES
     * ============================================================ */

    function normalizarAddress(address) {

        return String(
            address || ''
        ).trim();

    }


    function esAddressValida(address) {

        return /^0x[a-fA-F0-9]{40}$/.test(
            normalizarAddress(address)
        );

    }


    function obtenerChainIdNumerico(chainId) {

        if (
            typeof chainId === 'number'
        ) {

            return chainId;

        }


        if (
            typeof chainId === 'string'
        ) {

            if (
                chainId.startsWith('0x')
            ) {

                return parseInt(
                    chainId,
                    16
                );

            }


            return Number(chainId);

        }


        return Number(chainId);

    }


    function obtenerChainIdHex(chainId) {

        const numeric =
            obtenerChainIdNumerico(
                chainId
            );


        if (
            !Number.isFinite(numeric)
        ) {

            return null;

        }


        return '0x' +
            numeric.toString(16);

    }


    function obtenerErrorCode(error) {

        if (!error) {

            return '';

        }


        if (
            error.code !== undefined &&
            error.code !== null
        ) {

            return String(
                error.code
            );

        }


        if (
            error.data &&
            error.data.code !== undefined
        ) {

            return String(
                error.data.code
            );

        }


        return String(
            error.message || ''
        );

    }


    function errorUsuarioCancelo(error) {

        const code =
            obtenerErrorCode(error);


        return (

            code === '4001' ||

            code === 'USER_REJECTED' ||

            code === 'USER_CANCELLED'

        );

    }


    /* ============================================================
     * DETECCIÓN DE PROVIDER
     * ============================================================ */

    function obtenerInjectedProvider() {

        if (
            !window.ethereum
        ) {

            return null;

        }


        /*
         * En algunos navegadores existen varios providers
         * dentro de window.ethereum.providers.
         */

        if (
            Array.isArray(
                window.ethereum.providers
            ) &&
            window.ethereum.providers.length
        ) {

            /*
             * MetaMask primero.
             */

            const metamask =
                window.ethereum.providers.find(
                    function (provider) {

                        return (
                            provider &&
                            provider.isMetaMask === true
                        );

                    }
                );


            if (
                metamask
            ) {

                return metamask;

            }


            /*
             * Coinbase.
             */

            const coinbase =
                window.ethereum.providers.find(
                    function (provider) {

                        return (
                            provider &&
                            provider.isCoinbaseWallet === true
                        );

                    }
                );


            if (
                coinbase
            ) {

                return coinbase;

            }


            return (
                window.ethereum.providers[0] ||
                null
            );

        }


        return window.ethereum;

    }


    function tieneInjectedProvider() {

        const provider =
            obtenerInjectedProvider();


        return Boolean(

            provider &&

            typeof provider.request ===
            'function'

        );

    }


    function esMovil() {

        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(
                navigator.userAgent || ''
            );

    }


    function esAndroid() {

        return /Android/i.test(
            navigator.userAgent || ''
        );

    }


    function esIOS() {

        return /iPhone|iPad|iPod/i.test(
            navigator.userAgent || ''
        );

    }


    function esNavegadorDeMetaMask() {

        const provider =
            obtenerInjectedProvider();


        return Boolean(

            provider &&

            provider.isMetaMask === true

        );

    }


    function esNavegadorDeCoinbase() {

        const provider =
            obtenerInjectedProvider();


        return Boolean(

            provider &&

            provider.isCoinbaseWallet === true

        );

    }


    function esNavegadorWalletInterno() {

        return (

            esNavegadorDeMetaMask() ||

            esNavegadorDeCoinbase()

        );

    }


    function debeUsarInjected() {

        if (
            !tieneInjectedProvider()
        ) {

            return false;

        }


        return (

            !esMovil() ||

            esNavegadorWalletInterno()

        );

    }


    /* ============================================================
     * CONFIGURACIÓN WEB3
     * ============================================================ */

    async function cargarConfiguracionWeb3() {

        if (
            WALLETCONNECT_PROJECT_ID
        ) {

            return {

                walletConnectProjectId:
                    WALLETCONNECT_PROJECT_ID,

                publicUrl:
                    PUBLIC_APP_URL,

                polygonChainId:
                    CHAIN_ID_OBJETIVO

            };

        }


        if (
            web3ConfigPromise
        ) {

            return web3ConfigPromise;

        }


        web3ConfigPromise =
            (async function () {

                let response;


                try {

                    response =
                        await fetch(
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


                    e.cause =
                        error;


                    throw e;

                }


                if (
                    !response.ok
                ) {

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


                if (
                    !projectId
                ) {

                    throw new Error(
                        'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
                    );

                }


                WALLETCONNECT_PROJECT_ID =
                    projectId;


                /*
                 * Usamos el publicUrl que entrega el servidor
                 * cuando existe.
                 */

                if (
                    config.publicUrl
                ) {

                    try {

                        const url =
                            new URL(
                                String(
                                    config.publicUrl
                                )
                            );


                        PUBLIC_APP_URL =
                            url.origin;

                    } catch (_) {

                        PUBLIC_APP_URL =
                            DEFAULT_PUBLIC_APP_URL;

                    }

                }


                const serverChainId =
                    Number(
                        config.polygonChainId
                    );


                return {

                    walletConnectProjectId:
                        WALLETCONNECT_PROJECT_ID,

                    publicUrl:
                        PUBLIC_APP_URL,

                    polygonChainId:
                        Number.isFinite(
                            serverChainId
                        )
                            ? serverChainId
                            : CHAIN_ID_OBJETIVO

                };

            })().catch(
                function (error) {

                    web3ConfigPromise =
                        null;

                    throw error;

                }
            );


        return web3ConfigPromise;

    }


    /* ============================================================
     * DEEP LINKS
     * ============================================================ */

    function obtenerURLActualParaWallet() {

        try {

            const base =
                PUBLIC_APP_URL ||
                window.location.origin;


            return new URL(

                window.location.pathname +
                window.location.search +
                window.location.hash,

                base

            );

        } catch (_) {

            return new URL(
                '/',
                DEFAULT_PUBLIC_APP_URL
            );

        }

    }


    function construirDeepLinkMetaMask() {

        const url =
            obtenerURLActualParaWallet();


        /*
         * MetaMask espera:
         *
         * https://metamask.app.link/dapp/DOMINIO/RUTA
         */

        return (

            'https://metamask.app.link/dapp/' +

            url.host +

            url.pathname +

            url.search +

            url.hash

        );

    }


    function abrirMetaMaskApp() {

        const deepLink =
            construirDeepLinkMetaMask();


        console.log(
            '[SarWallet] Abriendo MetaMask:',
            deepLink
        );


        try {

            window.location.assign(
                deepLink
            );

        } catch (error) {

            window.location.href =
                deepLink;

        }


        return deepLink;

    }


    function abrirRainbowApp() {

        let urlActual;


        try {

            urlActual =
                obtenerURLActualParaWallet()
                    .toString();

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
            '[SarWallet] Rainbow:',
            deepLink
        );


        try {

            window.location.assign(
                deepLink
            );

        } catch (error) {

            window.location.href =
                deepLink;

        }


        return deepLink;

    }


    /* ============================================================
     * SESIÓN LOCAL
     * ============================================================ */

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
                '[SarWallet] No se pudo guardar sesión:',
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


            if (
                !raw
            ) {

                return null;

            }


            const data =
                JSON.parse(raw);


            if (
                !data ||
                !data.timestamp
            ) {

                localStorage.removeItem(
                    'sar_wallet_session'
                );

                return null;

            }


            const edad =
                Date.now() -
                Number(
                    data.timestamp
                );


            if (
                edad >
                24 * 60 * 60 * 1000
            ) {

                localStorage.removeItem(
                    'sar_wallet_session'
                );

                return null;

            }


            if (
                !esAddressValida(
                    data.address
                )
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


    /* ============================================================
     * CAMBIAR RED
     * ============================================================ */

    async function cambiarRedInjected() {

        const provider =
            obtenerInjectedProvider();


        if (
            !provider
        ) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }


        try {

            await provider.request({

                method:
                    'wallet_switchEthereumChain',

                params: [

                    {

                        chainId:
                            CHAIN_ID_HEX

                    }

                ]

            });

        } catch (switchError) {

            const code =
                Number(
                    switchError?.code
                );


            /*
             * 4902:
             * la red no está agregada.
             */

            if (
                code === 4902
            ) {

                await provider.request({

                    method:
                        'wallet_addEthereumChain',

                    params: [

                        {

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

                        }

                    ]

                });

            } else {

                throw switchError;

            }

        }

    }


    /* ============================================================
     * CONEXIÓN INJECTED
     * ============================================================ */

    async function conectarConInjected() {

        const provider =
            obtenerInjectedProvider();


        if (
            !provider
        ) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }


        let accounts;


        try {

            accounts =
                await provider.request({

                    method:
                        'eth_requestAccounts'

                });

        } catch (error) {

            if (
                errorUsuarioCancelo(
                    error
                )
            ) {

                const e =
                    new Error(
                        'USER_REJECTED'
                    );


                e.cause =
                    error;


                throw e;

            }


            throw error;

        }


        if (

            !Array.isArray(accounts) ||

            accounts.length === 0

        ) {

            throw new Error(
                'NO_ACCOUNTS_RETURNED'
            );

        }


        const account =
            normalizarAddress(
                accounts[0]
            );


        if (
            !esAddressValida(
                account
            )
        ) {

            throw new Error(
                'INVALID_WALLET_ADDRESS'
            );

        }


        let chainIdHexActual;


        try {

            chainIdHexActual =
                await provider.request({

                    method:
                        'eth_chainId'

                });

        } catch (error) {

            throw error;

        }


        let chainIdActual =
            obtenerChainIdNumerico(
                chainIdHexActual
            );


        if (
            chainIdActual !==
            CHAIN_ID_OBJETIVO
        ) {

            await cambiarRedInjected();


            chainIdHexActual =
                await provider.request({

                    method:
                        'eth_chainId'

                });


            chainIdActual =
                obtenerChainIdNumerico(
                    chainIdHexActual
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


        window.dispatchEvent(

            new CustomEvent(
                'sar:wallet:connected',

                {

                    detail: {

                        address:
                            account,

                        chainId:
                            CHAIN_ID_OBJETIVO,

                        tipo:
                            'injected'

                    }

                }

            )

        );


        return {

            tipo:
                'injected',

            address:
                account,

            chainId:
                CHAIN_ID_OBJETIVO,

            provider:
                provider

        };

    }


    /* ============================================================
     * VALIDAR INJECTED
     * ============================================================ */

    async function validarSesionInjected() {

        const provider =
            obtenerInjectedProvider();


        if (
            !provider
        ) {

            return null;

        }


        try {

            const accounts =
                await provider.request({

                    method:
                        'eth_accounts'

                });


            if (

                !Array.isArray(accounts) ||

                accounts.length === 0

            ) {

                return null;

            }


            const address =
                normalizarAddress(
                    accounts[0]
                );


            if (
                !esAddressValida(
                    address
                )
            ) {

                return null;

            }


            const chainIdHex =
                await provider.request({

                    method:
                        'eth_chainId'

                });


            const chainId =
                obtenerChainIdNumerico(
                    chainIdHex
                );


            if (
                chainId !==
                CHAIN_ID_OBJETIVO
            ) {

                return null;

            }


            return {

                address:
                    address,

                chainId:
                    chainId,

                provider:
                    provider

            };

        } catch (error) {

            console.warn(
                '[SarWallet] Error validando injected:',
                error
            );


            return null;

        }

    }


    /* ============================================================
     * EVENTOS INJECTED
     * ============================================================ */

    function registrarEventosInjected() {

        const provider =
            obtenerInjectedProvider();


        if (

            eventosInjectedRegistrados ||

            !provider ||

            typeof provider.on !==
            'function'

        ) {

            return;

        }


        eventosInjectedRegistrados =
            true;


        provider.on(

            'accountsChanged',

            function (accounts) {

                if (

                    !Array.isArray(accounts) ||

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


                const address =
                    normalizarAddress(
                        accounts[0]
                    );


                currentAccount =
                    address;


                guardarSesion({

                    tipo:
                        'injected',

                    address:
                        address,

                    chainId:
                        CHAIN_ID_OBJETIVO

                });


                window.dispatchEvent(

                    new CustomEvent(

                        'sar:wallet:accountsChanged',

                        {

                            detail: {

                                address:
                                    address

                            }

                        }

                    )

                );

            }

        );


        provider.on(

            'chainChanged',

            function (chainIdHex) {

                const chainId =
                    obtenerChainIdNumerico(
                        chainIdHex
                    );


                window.dispatchEvent(

                    new CustomEvent(

                        'sar:wallet:chainChanged',

                        {

                            detail: {

                                chainId:
                                    chainId

                            }

                        }

                    )

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

                                    chainId:
                                        chainId,

                                    expectedChainId:
                                        CHAIN_ID_OBJETIVO

                                }

                            }

                        )

                    );

                }

            }

        );


        /*
         * Algunos providers también emiten disconnect.
         */

        try {

            provider.on(

                'disconnect',

                function () {

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

        } catch (_) {}

    }


    /* ============================================================
     * DESTRUIR WALLETCONNECT ANTERIOR
     * ============================================================ */

    async function destruirWalletConnectAnterior() {

        const provider =
            wcProvider;


        wcProvider =
            null;


        eventosWcRegistrados =
            false;


        if (
            provider &&
            typeof provider.disconnect ===
            'function'
        ) {

            try {

                await provider.disconnect();

            } catch (_) {}

        }

    }


    /* ============================================================
     * WALLETCONNECT
     * ============================================================ */

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


        await destruirWalletConnectAnterior();


        let EthereumProvider;


        try {

            const modulo =
                await import(

                    'https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/+esm'

                );


            EthereumProvider =
                modulo.EthereumProvider ||
                modulo.default;


        } catch (error) {

            const e =
                new Error(
                    'WALLETCONNECT_SDK_LOAD_FAILED'
                );


            e.cause =
                error;


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


        try {

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
                                '2147483647'

                        }

                    },

                    metadata: {

                        name:
                            "Sariel's Ecosystem",

                        description:
                            "Ecosistema Web3 Csariel's",

                        url:
                            config.publicUrl ||
                            PUBLIC_APP_URL,

                        icons: [

                            (
                                config.publicUrl ||
                                PUBLIC_APP_URL
                            ) +
                            '/favicon.ico'

                        ]

                    }

                });

        } catch (error) {

            const e =
                new Error(
                    'WALLETCONNECT_PROVIDER_INIT_FAILED'
                );


            e.cause =
                error;


            throw e;

        }


        if (
            !wcProvider
        ) {

            throw new Error(
                'WALLETCONNECT_PROVIDER_INIT_FAILED'
            );

        }


        try {

            await wcProvider.connect();

        } catch (error) {

            if (
                errorUsuarioCancelo(
                    error
                )
            ) {

                const e =
                    new Error(
                        'USER_CANCELLED'
                    );


                e.cause =
                    error;


                throw e;

            }


            throw error;

        }


        const accounts =
            Array.isArray(
                wcProvider.accounts
            )
                ? wcProvider.accounts
                : [];


        if (
            accounts.length === 0
        ) {

            throw new Error(
                'WALLETCONNECT_NO_ACCOUNTS'
            );

        }


        const account =
            normalizarAddress(
                accounts[0]
            );


        if (
            !esAddressValida(
                account
            )
        ) {

            throw new Error(
                'INVALID_WALLET_ADDRESS'
            );

        }


        const chainId =
            obtenerChainIdNumerico(
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

            chainId:
                chainId

        });


        registrarEventosWalletConnect();


        window.dispatchEvent(

            new CustomEvent(
                'sar:wallet:connected',

                {

                    detail: {

                        address:
                            account,

                        chainId:
                            chainId,

                        tipo:
                            'walletconnect'

                    }

                }

            )

        );


        return {

            tipo:
                'walletconnect',

            address:
                account,

            chainId:
                chainId,

            provider:
                wcProvider

        };

    }


    /* ============================================================
     * EVENTOS WALLETCONNECT
     * ============================================================ */

    function registrarEventosWalletConnect() {

        if (

            !wcProvider ||

            eventosWcRegistrados ||

            typeof wcProvider.on !==
            'function'

        ) {

            return;

        }


        eventosWcRegistrados =
            true;


        wcProvider.on(

            'accountsChanged',

            function (accounts) {

                if (

                    !Array.isArray(accounts) ||

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


                const address =
                    normalizarAddress(
                        accounts[0]
                    );


                currentAccount =
                    address;


                guardarSesion({

                    tipo:
                        'walletconnect',

                    address:
                        address,

                    chainId:
                        obtenerChainIdNumerico(
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
                                    address

                            }

                        }

                    )

                );

            }

        );


        wcProvider.on(

            'chainChanged',

            function (chainId) {

                const numericChainId =
                    obtenerChainIdNumerico(
                        chainId
                    );


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

            function () {

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


    /* ============================================================
     * MODAL DE SELECCIÓN
     * ============================================================ */

    function cerrarSelectorWallet(
        modal,
        reject
    ) {

        if (
            modal &&
            modal.parentNode
        ) {

            modal.remove();

        }


        if (
            reject
        ) {

            reject(
                new Error(
                    'USER_CANCELLED'
                )
            );

        }

    }


    function seleccionarConexion() {

        return new Promise(

            function (resolve, reject) {

                const modal =
                    document.createElement(
                        'div'
                    );


                modal.id =
                    'sar-wallet-selector';


                modal.style.cssText = `

                    position:fixed;
                    inset:0;
                    z-index:2147483647;
                    background:rgba(3,7,15,.94);
                    backdrop-filter:blur(14px);
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    padding:18px;
                    box-sizing:border-box;

                `;


                modal.innerHTML = `

                    <div style="

                        width:min(430px,100%);
                        max-height:90vh;
                        overflow:auto;
                        background:
                            linear-gradient(
                                145deg,
                                #0b1625,
                                #07110e
                            );
                        border:
                            1px solid rgba(0,229,255,.35);
                        border-radius:24px;
                        padding:22px;
                        box-shadow:
                            0 25px 80px
                            rgba(0,0,0,.65);

                    ">

                        <div style="
                            display:flex;
                            align-items:center;
                            justify-content:space-between;
                            gap:12px;
                            margin-bottom:18px;
                        ">

                            <div>

                                <div style="
                                    color:#00e5ff;
                                    font-family:Orbitron,monospace;
                                    font-size:1rem;
                                    font-weight:900;
                                ">
                                    CONECTAR WALLET
                                </div>

                                <div style="
                                    color:#8ca3b8;
                                    font-size:.72rem;
                                    margin-top:5px;
                                ">
                                    Polygon Amoy · Chain 80002
                                </div>

                            </div>

                            <button
                                type="button"
                                id="sar-wallet-selector-close"
                                style="
                                    border:0;
                                    background:rgba(255,255,255,.06);
                                    color:#fff;
                                    width:38px;
                                    height:38px;
                                    border-radius:50%;
                                    font-size:1.2rem;
                                    cursor:pointer;
                                "
                            >
                                ×
                            </button>

                        </div>


                        <button
                            type="button"
                            id="sar-connect-metamask"
                            style="
                                width:100%;
                                border:0;
                                border-radius:15px;
                                padding:15px;
                                margin:6px 0;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #f6851b,
                                        #d85f00
                                    );
                                color:#fff;
                                font-weight:800;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🦊 MetaMask
                        </button>


                        <button
                            type="button"
                            id="sar-connect-walletconnect"
                            style="
                                width:100%;
                                border:0;
                                border-radius:15px;
                                padding:15px;
                                margin:6px 0;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #3b99fc,
                                        #246ac4
                                    );
                                color:#fff;
                                font-weight:800;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🔗 WalletConnect
                        </button>


                        <button
                            type="button"
                            id="sar-connect-coinbase"
                            style="
                                width:100%;
                                border:0;
                                border-radius:15px;
                                padding:15px;
                                margin:6px 0;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #2457ff,
                                        #173aa7
                                    );
                                color:#fff;
                                font-weight:800;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🔷 Coinbase Wallet
                        </button>


                        <button
                            type="button"
                            id="sar-connect-rainbow"
                            style="
                                width:100%;
                                border:0;
                                border-radius:15px;
                                padding:15px;
                                margin:6px 0;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #7c3aed,
                                        #ec4899
                                    );
                                color:#fff;
                                font-weight:800;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🌈 Rainbow
                        </button>


                        <div style="
                            margin-top:16px;
                            padding:12px;
                            border-radius:12px;
                            background:rgba(255,255,255,.04);
                            color:#7f96ab;
                            font-size:.68rem;
                            line-height:1.5;
                            text-align:center;
                        ">
                            En Android Chrome puedes usar
                            WalletConnect o abrir directamente
                            MetaMask.
                        </div>

                    </div>

                `;


                document.body.appendChild(
                    modal
                );


                const cerrar =
                    function () {

                        cerrarSelectorWallet(
                            modal,
                            reject
                        );

                    };


                const closeButton =
                    modal.querySelector(
                        '#sar-wallet-selector-close'
                    );


                if (
                    closeButton
                ) {

                    closeButton.onclick =
                        cerrar;

                }


                modal.addEventListener(
                    'click',
                    function (event) {

                        if (
                            event.target ===
                            modal
                        ) {

                            cerrar();

                        }

                    }
                );


                /* =================================================
                 * METAMASK
                 * ================================================= */

                const metamaskButton =
                    modal.querySelector(
                        '#sar-connect-metamask'
                    );


                if (
                    metamaskButton
                ) {

                    metamaskButton.onclick =

                        async function () {

                            const btn =
                                this;


                            try {

                                btn.disabled =
                                    true;

                                btn.textContent =
                                    '⏳ Conectando...';


                                /*
                                 * MetaMask Browser / provider
                                 */

                                if (
                                    esNavegadorDeMetaMask()
                                ) {

                                    const result =
                                        await conectarConInjected();


                                    modal.remove();

                                    resolve(
                                        result
                                    );

                                    return;

                                }


                                /*
                                 * Desktop con MetaMask.
                                 */

                                if (

                                    !esMovil() &&

                                    tieneInjectedProvider()

                                ) {

                                    const result =
                                        await conectarConInjected();


                                    modal.remove();

                                    resolve(
                                        result
                                    );

                                    return;

                                }


                                /*
                                 * Android Chrome / iOS Safari:
                                 * deep link.
                                 */

                                const deepLink =
                                    abrirMetaMaskApp();


                                modal.remove();


                                resolve({

                                    openedApp:
                                        true,

                                    tipo:
                                        'metamask-deeplink',

                                    deepLink:
                                        deepLink

                                });

                            } catch (error) {

                                console.error(
                                    '[SarWallet] MetaMask:',
                                    error
                                );


                                btn.disabled =
                                    false;

                                btn.textContent =
                                    '🦊 MetaMask';


                                alert(
                                    obtenerMensajeError(
                                        error
                                    )
                                );

                            }

                        };

                }


                /* =================================================
                 * WALLETCONNECT
                 * ================================================= */

                const walletConnectButton =
                    modal.querySelector(
                        '#sar-connect-walletconnect'
                    );


                if (
                    walletConnectButton
                ) {

                    walletConnectButton.onclick =

                        async function () {

                            const btn =
                                this;


                            try {

                                btn.disabled =
                                    true;

                                btn.textContent =
                                    '⏳ Abriendo WalletConnect...';


                                const result =
                                    await conectarConWalletConnect();


                                modal.remove();


                                resolve(
                                    result
                                );

                            } catch (error) {

                                console.error(
                                    '[SarWallet] WalletConnect:',
                                    error
                                );


                                btn.disabled =
                                    false;

                                btn.textContent =
                                    '🔗 WalletConnect';


                                if (
                                    error?.message ===
                                    'USER_CANCELLED'
                                ) {

                                    return;

                                }


                                alert(
                                    obtenerMensajeError(
                                        error
                                    )
                                );

                            }

                        };

                }


                /* =================================================
                 * COINBASE
                 * ================================================= */

                const coinbaseButton =
                    modal.querySelector(
                        '#sar-connect-coinbase'
                    );


                if (
                    coinbaseButton
                ) {

                    coinbaseButton.onclick =

                        async function () {

                            const btn =
                                this;


                            try {

                                btn.disabled =
                                    true;

                                btn.textContent =
                                    '⏳ Conectando...';


                                /*
                                 * Coinbase Browser
                                 */

                                if (
                                    esNavegadorDeCoinbase()
                                ) {

                                    const result =
                                        await conectarConInjected();


                                    modal.remove();


                                    resolve(
                                        result
                                    );


                                    return;

                                }


                                /*
                                 * Coinbase externo:
                                 * WalletConnect.
                                 */

                                const result =
                                    await conectarConWalletConnect();


                                modal.remove();


                                resolve(
                                    result
                                );

                            } catch (error) {

                                console.error(
                                    '[SarWallet] Coinbase:',
                                    error
                                );


                                btn.disabled =
                                    false;

                                btn.textContent =
                                    '🔷 Coinbase Wallet';


                                if (
                                    error?.message ===
                                    'USER_CANCELLED'
                                ) {

                                    return;

                                }


                                alert(
                                    obtenerMensajeError(
                                        error
                                    )
                                );

                            }

                        };

                }


                /* =================================================
                 * RAINBOW
                 * ================================================= */

                const rainbowButton =
                    modal.querySelector(
                        '#sar-connect-rainbow'
                    );


                if (
                    rainbowButton
                ) {

                    rainbowButton.onclick =

                        function () {

                            try {

                                const deepLink =
                                    abrirRainbowApp();


                                modal.remove();


                                resolve({

                                    openedApp:
                                        true,

                                    tipo:
                                        'rainbow-deeplink',

                                    deepLink:
                                        deepLink

                                });

                            } catch (error) {

                                console.error(
                                    '[SarWallet] Rainbow:',
                                    error
                                );


                                alert(
                                    obtenerMensajeError(
                                        error
                                    )
                                );

                            }

                        };

                }

            }

        );

    }


    /* ============================================================
     * MENSAJES DE ERROR
     * ============================================================ */

    function obtenerMensajeError(error) {

        const code =
            obtenerErrorCode(
                error
            );


        const mensajes = {

            WEB3_CONFIG_NETWORK_ERROR:
                'No se pudo contactar el servidor para cargar WalletConnect.',

            WEB3_CONFIG_HTTP_400:
                'El servidor rechazó la configuración Web3.',

            WEB3_CONFIG_HTTP_401:
                'La configuración Web3 requiere autorización.',

            WEB3_CONFIG_HTTP_403:
                'El servidor bloqueó la configuración Web3.',

            WEB3_CONFIG_HTTP_404:
                'El endpoint /api/config/web3 no está disponible.',

            WEB3_CONFIG_HTTP_500:
                'El servidor devolvió un error de configuración Web3.',

            WEB3_CONFIG_INVALID:
                'La configuración Web3 del servidor no es válida.',

            WEB3_CONFIG_INVALID_JSON:
                'El servidor devolvió una configuración Web3 inválida.',

            WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED:
                'WalletConnect no está configurado en el servidor.',

            WALLETCONNECT_SDK_LOAD_FAILED:
                'No se pudo cargar WalletConnect. Comprueba tu conexión.',

            WALLETCONNECT_SDK_INVALID:
                'WalletConnect devolvió una respuesta inválida.',

            WALLETCONNECT_PROVIDER_INIT_FAILED:
                'No se pudo inicializar WalletConnect.',

            WALLETCONNECT_NO_ACCOUNTS:
                'La wallet no devolvió ninguna cuenta.',

            NO_ACCOUNTS_RETURNED:
                'La wallet no devolvió ninguna cuenta.',

            INVALID_WALLET_ADDRESS:
                'La wallet devolvió una dirección inválida.',

            INJECTED_NOT_AVAILABLE:
                'No se encontró una wallet instalada en este navegador.',

            WRONG_NETWORK:
                'La wallet debe estar conectada a Polygon Amoy.',

            USER_REJECTED:
                'Cancelaste la solicitud desde la wallet.',

            USER_CANCELLED:
                'Cancelaste la conexión.',

            '4001':
                'Cancelaste la solicitud desde la wallet.',

            '4902':
                'Polygon Amoy no está disponible en la wallet.'

        };


        return (

            mensajes[code] ||

            mensajes[
                String(
                    error?.code || ''
                )
            ] ||

            error?.message ||

            'No se pudo conectar la wallet.'

        );

    }


    /* ============================================================
     * CONEXIÓN PRINCIPAL
     * ============================================================ */

    async function conectar() {

        /*
         * Wallet interna móvil:
         * usar injected directamente.
         */

        if (

            esMovil() &&

            esNavegadorWalletInterno()

        ) {

            const estado =
                await validarSesionInjected();


            if (
                estado
            ) {

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
                        estado.provider,

                    reconnected:
                        true

                };

            }


            return conectarConInjected();

        }


        /*
         * Móvil normal:
         * mostrar selector.
         */

        if (
            esMovil()
        ) {

            return seleccionarConexion();

        }


        /*
         * Desktop con injected.
         */

        if (
            tieneInjectedProvider()
        ) {

            const estado =
                await validarSesionInjected();


            if (
                estado
            ) {

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
                        estado.provider,

                    reconnected:
                        true

                };

            }


            return conectarConInjected();

        }


        /*
         * Desktop sin extensión:
         * WalletConnect.
         */

        return conectarConWalletConnect();

    }


    /* ============================================================
     * RESTAURAR SESIÓN
     * ============================================================ */

    async function restaurarSesion() {

        const sesion =
            leerSesion();


        if (

            !sesion ||

            !sesion.address

        ) {

            return null;

        }


        /*
         * INJECTED
         */

        if (
            sesion.tipo ===
            'injected'
        ) {

            if (
                !debeUsarInjected()
            ) {

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
                    estado.provider

            };

        }


        /*
         * WALLETCONNECT
         */

        if (
            sesion.tipo ===
            'walletconnect'
        ) {

            if (

                wcProvider &&

                Array.isArray(
                    wcProvider.accounts
                ) &&

                wcProvider.accounts.length

            ) {

                const account =
                    normalizarAddress(
                        wcProvider.accounts[0]
                    );


                const chainId =
                    obtenerChainIdNumerico(
                        wcProvider.chainId
                    );


                if (

                    esAddressValida(
                        account
                    ) &&

                    chainId ===
                    CHAIN_ID_OBJETIVO

                ) {

                    currentAccount =
                        account;


                    currentProviderType =
                        'walletconnect';


                    registrarEventosWalletConnect();


                    return {

                        tipo:
                            'walletconnect',

                        address:
                            account,

                        chainId:
                            chainId,

                        provider:
                            wcProvider

                    };

                }

            }


            /*
             * No inventamos una sesión WC:
             * si el proveedor ya no existe, la página
             * deberá iniciar una conexión nueva.
             */

            return null;

        }


        return null;

    }


    /* ============================================================
     * DESCONEXIÓN
     * ============================================================ */

    function limpiarEstadoLocal() {

        currentAccount =
            null;


        currentProviderType =
            null;


        limpiarSesion();

    }


    async function desconectar() {

        if (
            desconectando
        ) {

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


    /* ============================================================
     * API PÚBLICA
     * ============================================================ */

    function obtenerProvider() {

        if (
            currentProviderType ===
            'injected'
        ) {

            return obtenerInjectedProvider();

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
                RED.name,

            explorer:
                RED.explorer

        };

    }


    /* ============================================================
     * EXPORTACIÓN
     * ============================================================ */

    window.SarWallet = {

        conectar,

        seleccionarConexion,

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


    /* ============================================================
     * LOG
     * ============================================================ */

    console.log(

        '[SarWallet] cargado',

        '| red:',
        RED_ACTIVA,

        '| chainId:',
        CHAIN_ID_OBJETIVO,

        '| explorer:',
        RED.explorer,

        '| móvil:',
        esMovil(),

        '| injected:',
        tieneInjectedProvider()

    );


})();