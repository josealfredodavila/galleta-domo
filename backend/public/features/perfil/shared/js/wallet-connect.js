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
 *   - Chrome / Safari → WalletConnect
 *   - MetaMask → deep link
 *   - Rainbow → deep link
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

    const PUBLIC_APP_URL =
        'https://auction.up.railway.app';

    const WEB3_CONFIG_ENDPOINT =
        '/api/config/web3';

    const RED_ACTIVA =
        'AMOY';

    const REDES = {

        MAINNET: {

            chainId:
                137,

            chainIdHex:
                '0x89',

            name:
                'Polygon Mainnet',

            rpcUrl:
                'https://polygon-rpc.com',

            explorer:
                'https://polygonscan.com',

            symbol:
                'POL'

        },

        AMOY: {

            chainId:
                80002,

            chainIdHex:
                '0x13882',

            name:
                'Polygon Amoy',

            rpcUrl:
                'https://rpc-amoy.polygon.technology/',

            explorer:
                'https://amoy.polygonscan.com',

            symbol:
                'POL'

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
     * DETECCIÓN DE PROVIDER
     * ============================================================ */

    function tieneInjectedProvider() {

        return Boolean(

            window.ethereum &&

            typeof window.ethereum.request ===
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

        return (

            tieneInjectedProvider() &&

            window.ethereum.isMetaMask ===
            true

        );

    }


    function esNavegadorDeCoinbase() {

        return (

            tieneInjectedProvider() &&

            window.ethereum.isCoinbaseWallet ===
            true

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

                                method:
                                    'GET',

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

    function construirDeepLinkMetaMask() {

        let path =
            window.location.pathname +
            window.location.search;


        if (
            !path
        ) {

            path =
                '/';

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
            '[SarWallet] MetaMask:',
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
            '[SarWallet] Rainbow:',
            deepLink
        );


        window.location.href =
            deepLink;

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

                !data.timestamp ||

                (
                    Date.now() -
                    data.timestamp
                ) >
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


    /* ============================================================
     * CAMBIAR RED
     * ============================================================ */

    async function cambiarRedInjected() {

        if (
            !tieneInjectedProvider()
        ) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }


        try {

            await window.ethereum.request({

                method:
                    'wallet_switchEthereumChain',

                params: [

                    {

                        chainId:
                            CHAIN_ID_HEX

                    }

                ]

            );

        } catch (switchError) {

            if (

                switchError &&

                switchError.code ===
                4902

            ) {

                await window.ethereum.request({

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

        if (
            !tieneInjectedProvider()
        ) {

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


    /* ============================================================
     * VALIDAR INJECTED
     * ============================================================ */

    async function validarSesionInjected() {

        if (
            !tieneInjectedProvider()
        ) {

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

                chainId:
                    chainId

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

            function (accounts) {

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

            function (chainIdHex) {

                const chainId =
                    parseInt(
                        chainIdHex,
                        16
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


        if (
            wcProvider
        ) {

            try {

                if (

                    typeof wcProvider.disconnect ===
                    'function'

                ) {

                    await wcProvider.disconnect();

                }

            } catch (_) {}

        }


        wcProvider =
            null;

        eventosWcRegistrados =
            false;


        let EthereumProvider;


        try {

            const modulo =
                await import(

                    'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'

                );


            EthereumProvider =
                modulo.EthereumProvider;

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


        if (
            !wcProvider
        ) {

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

            chainId:
                chainId

        });


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


    /* ============================================================
     * EVENTOS WALLETCONNECT
     * ============================================================ */

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

            function (accounts) {

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

            function (chainId) {

                const numericChainId =
                    Number(
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


                modal.querySelector(
                    '#sar-wallet-selector-close'
                ).onclick =
                    cerrar;


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

                modal.querySelector(
                    '#sar-connect-metamask'
                ).onclick =

                    async function () {

                        const btn =
                            this;

                        try {

                            btn.disabled =
                                true;

                            btn.textContent =
                                '⏳ Abriendo MetaMask...';


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
                             * Chrome/Safari móvil:
                             * abrir MetaMask.
                             */

                            abrirMetaMaskApp();

                            modal.remove();


                            resolve({

                                openedApp:
                                    true,

                                tipo:
                                    'metamask-deeplink'

                            });

                        } catch (error) {

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


                /* =================================================
                 * WALLETCONNECT
                 * ================================================= */

                modal.querySelector(
                    '#sar-connect-walletconnect'
                ).onclick =

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


                /* =================================================
                 * COINBASE
                 * ================================================= */

                modal.querySelector(
                    '#sar-connect-coinbase'
                ).onclick =

                    async function () {

                        const btn =
                            this;

                        try {

                            btn.disabled =
                                true;

                            btn.textContent =
                                '⏳ Abriendo Coinbase...';


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
                             * WalletConnect permite seleccionar
                             * Coinbase Wallet.
                             */

                            const result =
                                await conectarConWalletConnect();


                            modal.remove();

                            resolve(
                                result
                            );

                        } catch (error) {

                            btn.disabled =
                                false;

                            btn.textContent =
                                '🔷 Coinbase Wallet';


                            alert(
                                obtenerMensajeError(
                                    error
                                )
                            );

                        }

                    };


                /* =================================================
                 * RAINBOW
                 * ================================================= */

                modal.querySelector(
                    '#sar-connect-rainbow'
                ).onclick =

                    function () {

                        try {

                            abrirRainbowApp();

                            modal.remove();

                            resolve({

                                openedApp:
                                    true,

                                tipo:
                                    'rainbow-deeplink'

                            });

                        } catch (error) {

                            alert(
                                obtenerMensajeError(
                                    error
                                )
                            );

                        }

                    };

            }

        );

    }


    /* ============================================================
     * MENSAJES DE ERROR
     * ============================================================ */

    function obtenerMensajeError(error) {

        const code =
            error?.message ||
            '';


        const mensajes = {

            WEB3_CONFIG_NETWORK_ERROR:
                'No se pudo contactar el servidor para cargar WalletConnect.',

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

            INJECTED_NOT_AVAILABLE:
                'No se encontró una wallet instalada en este navegador.',

            WRONG_NETWORK:
                'La wallet debe estar conectada a Polygon Amoy.',

            USER_REJECTED:
                'Cancelaste la solicitud desde la wallet.',

            USER_CANCELLED:
                'Cancelaste la conexión.'

        };


        return (

            mensajes[code] ||

            error?.message ||

            'No se pudo conectar la wallet.'

        );

    }


    /* ============================================================
     * CONEXIÓN PRINCIPAL
     * ============================================================ */

    async function conectar() {

        /*
         * Si estamos dentro de una wallet móvil,
         * usamos directamente el provider injected.
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
                        window.ethereum,

                    reconnected:
                        true

                };

            }


            return conectarConInjected();

        }


        /*
         * En móvil normal usamos el selector.
         */

        if (
            esMovil()
        ) {

            return seleccionarConexion();

        }


        /*
         * Desktop con injected:
         * conexión directa.
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
                        window.ethereum,

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
                    window.ethereum

            };

        }


        /*
         * WalletConnect:
         *
         * El proveedor se mantiene si la página
         * aún tiene una sesión activa.
         */

        if (
            sesion.tipo ===
            'walletconnect'
        ) {

            if (
                wcProvider &&
                wcProvider.accounts?.length
            ) {

                currentAccount =
                    wcProvider.accounts[0];

                currentProviderType =
                    'walletconnect';

                registrarEventosWalletConnect();


                return {

                    tipo:
                        'walletconnect',

                    address:
                        currentAccount,

                    chainId:
                        Number(
                            wcProvider.chainId ||
                            CHAIN_ID_OBJETIVO
                        ),

                    provider:
                        wcProvider

                };

            }


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