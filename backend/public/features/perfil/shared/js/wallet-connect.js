/*
 * ================================================================
 * WALLET CONNECT - Sariel's Ecosystem
 * ================================================================
 *
 * Compatible con:
 *
 * Desktop:
 * - MetaMask
 * - Coinbase Wallet
 * - cualquier wallet injected
 *
 * Móvil:
 * - navegador interno de MetaMask/Coinbase → injected
 * - Chrome/Safari → WalletConnect
 *
 * Polygon Amoy:
 * Chain ID: 80002
 *
 * Configuración Web3:
 * - Se obtiene desde /api/config/web3
 * - No se hardcodea el Project ID
 *
 * Uso:
 *
 * window.SarWallet.conectar()
 * window.SarWallet.desconectar()
 * window.SarWallet.obtenerCuenta()
 * window.SarWallet.obtenerProvider()
 * ================================================================
 */

(function () {
    'use strict';

    // ================================================================
    // CONFIGURACIÓN
    // ================================================================

    /*
     * URL pública/canónica de Sariel's.
     *
     * IMPORTANTE:
     * No utilizar window.location.host para identificar
     * la dApp en WalletConnect/deep links.
     *
     * Esto evita que el flujo termine apuntando al dominio
     * generado de Railway:
     *
     * galleta-domo-production.up.railway.app
     */

    const PUBLIC_APP_URL =
        'https://auction.up.railway.app';

    /*
     * Endpoint del backend que entrega la configuración
     * pública de Web3.
     */

    const WEB3_CONFIG_ENDPOINT =
        '/api/config/web3';

    // ================================================================
    // RED ACTIVA
    // ================================================================

    /*
     * TESTNET:
     *   AMOY
     *
     * PRODUCCIÓN:
     *   MAINNET
     */

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

    const RED =
        REDES[RED_ACTIVA];

    const CHAIN_ID_OBJETIVO =
        RED.chainId;

    const CHAIN_ID_HEX =
        RED.chainIdHex;

    // ================================================================
    // WALLETCONNECT CONFIG
    // ================================================================

    /*
     * El Project ID se carga desde:
     *
     * GET /api/config/web3
     *
     * El valor queda en memoria y no se escribe en localStorage.
     */

    let WALLETCONNECT_PROJECT_ID =
        null;

    let web3ConfigPromise =
        null;

    // ================================================================
    // ESTADO
    // ================================================================

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

    // ================================================================
    // CARGAR CONFIGURACIÓN WEB3
    // ================================================================

    async function cargarConfiguracionWeb3() {

        /*
         * Si ya tenemos la configuración,
         * no hacemos otra petición.
         */

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

        /*
         * Evitar varias peticiones simultáneas.
         */

        if (
            web3ConfigPromise
        ) {

            return await web3ConfigPromise;

        }

        web3ConfigPromise =
            (async () => {

                try {

                    const response =
                        await fetch(
                            WEB3_CONFIG_ENDPOINT,
                            {
                                method: 'GET',

                                headers: {
                                    'Accept':
                                        'application/json'
                                },

                                credentials:
                                    'same-origin',

                                cache:
                                    'no-store'
                            }
                        );

                    if (
                        !response.ok
                    ) {

                        throw new Error(
                            'WEB3_CONFIG_HTTP_' +
                            response.status
                        );

                    }

                    const config =
                        await response.json();

                    if (
                        !config ||
                        !config.success
                    ) {

                        throw new Error(
                            'WEB3_CONFIG_INVALID'
                        );

                    }

                    if (
                        !config.walletConnectProjectId
                    ) {

                        throw new Error(
                            'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
                        );

                    }

                    /*
                     * Guardamos únicamente el Project ID.
                     *
                     * La URL canónica sigue siendo la fija
                     * de la aplicación.
                     */

                    WALLETCONNECT_PROJECT_ID =
                        String(
                            config.walletConnectProjectId
                        ).trim();

                    /*
                     * El frontend sigue utilizando Amoy.
                     *
                     * Si el backend devuelve otro Chain ID,
                     * avisamos en consola pero NO cambiamos
                     * silenciosamente la red configurada.
                     */

                    if (
                        Number(
                            config.polygonChainId
                        ) !==
                        CHAIN_ID_OBJETIVO
                    ) {

                        console.warn(
                            '⚠️ Chain ID Web3 del backend:',
                            config.polygonChainId,
                            '| Chain ID esperado:',
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
                            ) || CHAIN_ID_OBJETIVO

                    };

                } catch (error) {

                    console.error(
                        '❌ No se pudo cargar la configuración Web3:',
                        error
                    );

                    /*
                     * Permitimos reintentar posteriormente.
                     */

                    web3ConfigPromise =
                        null;

                    throw error;

                }

            })();

        return await web3ConfigPromise;

    }

    // ================================================================
    // DETECCIÓN
    // ================================================================

    function tieneInjectedProvider() {

        return (
            typeof window.ethereum !==
                'undefined' &&
            window.ethereum !== null
        );

    }

    function esMovil() {

        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(
                navigator.userAgent
            );

    }

    function esAndroid() {

        return /Android/i.test(
            navigator.userAgent
        );

    }

    function esIOS() {

        return /iPhone|iPad|iPod/i.test(
            navigator.userAgent
        );

    }

    function esNavegadorDeMetaMask() {

        if (
            !tieneInjectedProvider()
        ) {

            return false;

        }

        return Boolean(
            window.ethereum.isMetaMask
        );

    }

    function esNavegadorDeCoinbase() {

        if (
            !tieneInjectedProvider()
        ) {

            return false;

        }

        return Boolean(
            window.ethereum.isCoinbaseWallet
        );

    }

    /*
     * Detecta si estamos en el navegador interno
     * de una wallet conocida.
     *
     * IMPORTANTE:
     *
     * Chrome móvil puede tener algún proveedor
     * inyectado disponible por otras razones.
     *
     * No queremos que eso haga que Chrome
     * salte WalletConnect.
     */

    function esNavegadorWalletInterno() {

        return (
            esNavegadorDeMetaMask() ||
            esNavegadorDeCoinbase()
        );

    }

    /*
     * Decide si debemos utilizar injected.
     *
     * Desktop:
     *   Sí.
     *
     * Móvil dentro de MetaMask:
     *   Sí.
     *
     * Móvil dentro de Coinbase:
     *   Sí.
     *
     * Chrome/Safari móvil:
     *   NO → WalletConnect.
     */

    function debeUsarInjected() {

        if (
            !tieneInjectedProvider()
        ) {

            return false;

        }

        /*
         * En móvil:
         *
         * solamente aceptamos injected si sabemos
         * que estamos dentro de una wallet compatible.
         */

        if (
            esMovil()
        ) {

            return esNavegadorWalletInterno();

        }

        /*
         * Desktop:
         * cualquier injected provider válido.
         */

        return true;

    }

    // ================================================================
    // DEEP LINK METAMASK
    // ================================================================

    function construirDeepLinkMetaMask() {

        /*
         * Siempre usamos la URL canónica.
         *
         * No usamos window.location.host porque
         * queremos evitar cualquier posibilidad de
         * terminar enviando al usuario a:
         *
         * galleta-domo-production.up.railway.app
         */

        let pathActual =
            window.location.pathname +
            window.location.search;

        /*
         * Si la ruta actual es la raíz,
         * dejamos solamente "/".
         */

        if (
            !pathActual
        ) {

            pathActual =
                '/';

        }

        /*
         * MetaMask espera:
         *
         * https://metamask.app.link/dapp/<host>/<path>
         *
         * No incluir "https://" dentro de /dapp/.
         */

        let canonicalUrl;

        try {

            canonicalUrl =
                new URL(
                    pathActual,
                    PUBLIC_APP_URL
                );

        } catch (e) {

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
            '🔗 Abriendo MetaMask desde:',
            deepLink
        );

        window.location.href =
            deepLink;

    }

    // ================================================================
    // DEEP LINK RAINBOW
    // ================================================================

    function abrirRainbowApp() {

        /*
         * Rainbow debe recibir la URL canónica,
         * no una posible URL interna de Railway.
         */

        let urlActual;

        try {

            urlActual =
                new URL(
                    window.location.pathname +
                    window.location.search,
                    PUBLIC_APP_URL
                ).toString();

        } catch (e) {

            urlActual =
                PUBLIC_APP_URL;
        }

        const url =
            encodeURIComponent(
                urlActual
            );

        const deepLink =
            'https://rnbwapp.com/dapp?url=' +
            url;

        console.log(
            '🔗 Abriendo Rainbow:',
            deepLink
        );

        window.location.href =
            deepLink;

    }

    // ================================================================
    // SESIÓN LOCAL
    // ================================================================

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

        } catch (e) {

            console.warn(
                'No se pudo guardar sesión:',
                e
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

        } catch (e) {

            return null;

        }

    }

    function limpiarSesion() {

        try {

            localStorage.removeItem(
                'sar_wallet_session'
            );

        } catch (e) {}

    }

    // ================================================================
    // CAMBIAR RED EN INJECTED
    // ================================================================

    async function cambiarRedInjected() {

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

            /*
             * 4902 = red no agregada.
             */

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

    // ================================================================
    // CONEXIÓN INJECTED
    // ================================================================

    async function conectarConInjected() {

        if (
            !tieneInjectedProvider()
        ) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }

        /*
         * Solicitamos permiso.
         */

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

        /*
         * Cambiar a Polygon Amoy/Mainnet.
         */

        if (
            chainIdActual !==
            CHAIN_ID_OBJETIVO
        ) {

            await cambiarRedInjected();

            /*
             * Volver a comprobar la red.
             */

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

    // ================================================================
    // EVENTOS INJECTED
    // ================================================================

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
            async (chainIdHex) => {

                const chainId =
                    parseInt(
                        chainIdHex,
                        16
                    );

                /*
                 * Si la wallet cambia a otra red,
                 * no fingimos que sigue estando
                 * en Polygon Amoy.
                 */

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

    // ================================================================
    // VALIDAR SESIÓN INJECTED
    // ================================================================

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

                chainId

            };

        } catch (e) {

            console.warn(
                'No se pudo validar injected:',
                e
            );

            return null;

        }

    }

    // ================================================================
    // WALLETCONNECT
    // ================================================================

    async function conectarConWalletConnect() {

        /*
         * Primero cargamos la configuración del backend.
         */

        const config =
            await cargarConfiguracionWeb3();

        if (
            !config.walletConnectProjectId
        ) {

            throw new Error(
                'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
            );

        }

        /*
         * Si existe un provider anterior,
         * intentamos limpiarlo antes de crear otro.
         */

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

            } catch (e) {

                console.warn(
                    'No se pudo limpiar WalletConnect anterior:',
                    e
                );

            }

            wcProvider =
                null;

        }

        /*
         * Carga dinámica del SDK.
         */

        const {
            EthereumProvider
        } = await import(
            'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'
        );

        /*
         * Inicialización WalletConnect.
         */

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

                    /*
                     * MUY IMPORTANTE:
                     *
                     * Siempre la URL pública/canónica.
                     *
                     * No usar window.location.origin.
                     */

                    url:
                        PUBLIC_APP_URL,

                    icons: [

                        PUBLIC_APP_URL +
                        '/favicon.ico'

                    ]

                }

            });

        /*
         * Iniciar conexión.
         */

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

    // ================================================================
    // EVENTOS WALLETCONNECT
    // ================================================================

    function registrarEventosWalletConnect() {

        if (
            !wcProvider
        ) {

            return;

        }

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
                            wcProvider.chainId
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

            }
        );

        wcProvider.on(
            'disconnect',
            () => {

                wcProvider =
                    null;

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

    // ================================================================
    // MODAL MÓVIL
    // ================================================================

    function mostrarModalMovil() {

        return new Promise(
            (resolve, reject) => {

                const modal =
                    document.createElement('div');

                modal.id =
                    'sar-wallet-modal';

                modal.style.cssText = `
                    position:fixed;
                    inset:0;
                    z-index:99998;
                    background:rgba(5,8,15,.95);
                    backdrop-filter:blur(12px);
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    padding:20px;
                `;

                modal.innerHTML = `
                    <div style="
                        background:linear-gradient(
                            135deg,
                            #0F2D1A,
                            #05080f
                        );
                        border:2px solid #D4AF37;
                        border-radius:20px;
                        padding:28px;
                        max-width:420px;
                        width:100%;
                        box-shadow:
                            0 0 60px
                            rgba(212,175,55,.3);
                    ">

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                            margin-bottom:20px;
                        ">

                            <h2 style="
                                font-family:Orbitron,monospace;
                                color:#D4AF37;
                                font-size:1.1rem;
                                margin:0;
                            ">
                                Conectar Wallet
                            </h2>

                            <button
                                id="sar-modal-cerrar"
                                style="
                                    background:none;
                                    border:none;
                                    color:#8aa8b8;
                                    font-size:1.5rem;
                                    cursor:pointer;
                                "
                            >
                                ✕
                            </button>

                        </div>

                        <p style="
                            color:#c0d8e8;
                            font-size:.85rem;
                            margin-bottom:20px;
                        ">
                            Elige cómo quieres conectar tu wallet:
                        </p>

                        <button
                            id="sar-btn-wc"
                            style="
                                width:100%;
                                padding:14px;
                                margin-bottom:10px;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #3b99fc,
                                        #2b7cd3
                                    );
                                color:white;
                                border:none;
                                border-radius:12px;
                                font-weight:600;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🔗 Conectar con WalletConnect
                        </button>

                        <button
                            id="sar-btn-mm"
                            style="
                                width:100%;
                                padding:14px;
                                margin-bottom:10px;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #f6851b,
                                        #e2761b
                                    );
                                color:white;
                                border:none;
                                border-radius:12px;
                                font-weight:600;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🦊 Abrir MetaMask
                        </button>

                        <button
                            id="sar-btn-rainbow"
                            style="
                                width:100%;
                                padding:14px;
                                background:
                                    linear-gradient(
                                        135deg,
                                        #001E59,
                                        #174299
                                    );
                                color:white;
                                border:none;
                                border-radius:12px;
                                font-weight:600;
                                font-size:.9rem;
                                cursor:pointer;
                            "
                        >
                            🌈 Abrir Rainbow
                        </button>

                        <p style="
                            color:#8aa8b8;
                            font-size:.7rem;
                            margin-top:16px;
                            text-align:center;
                        ">
                            En Chrome móvil,
                            WalletConnect es el método
                            recomendado para conectar
                            la wallet.
                        </p>

                    </div>
                `;

                document.body.appendChild(
                    modal
                );

                const cerrar =
                    () => {

                        modal.remove();

                        reject(
                            new Error(
                                'USER_CANCELLED'
                            )
                        );

                    };

                modal.querySelector(
                    '#sar-modal-cerrar'
                ).onclick =
                    cerrar;

                modal.onclick =
                    (e) => {

                        if (
                            e.target === modal
                        ) {

                            cerrar();

                        }

                    };

                // ====================================================
                // WALLETCONNECT
                // ====================================================

                modal.querySelector(
                    '#sar-btn-wc'
                ).onclick =
                    async () => {

                        const btn =
                            modal.querySelector(
                                '#sar-btn-wc'
                            );

                        try {

                            btn.disabled =
                                true;

                            btn.textContent =
                                '⏳ Abriendo wallet...';

                            const result =
                                await conectarConWalletConnect();

                            modal.remove();

                            resolve(
                                result
                            );

                        } catch (e) {

                            console.error(
                                '❌ WalletConnect:',
                                e
                            );

                            btn.disabled =
                                false;

                            btn.textContent =
                                '🔗 Conectar con WalletConnect';

                            if (
                                e?.message ===
                                'USER_CANCELLED'
                            ) {

                                return;

                            }

                            let mensaje =
                                'No se pudo conectar la wallet.';

                            if (
                                e?.message ===
                                'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
                            ) {

                                mensaje =
                                    'WalletConnect no está configurado en el servidor.';

                            } else if (
                                e?.message ===
                                'WRONG_NETWORK'
                            ) {

                                mensaje =
                                    'La wallet no está en Polygon Amoy.';

                            } else if (
                                e?.message
                            ) {

                                mensaje +=
                                    '\n\n' +
                                    e.message;

                            }

                            alert(
                                mensaje
                            );

                        }

                    };

                // ====================================================
                // METAMASK
                // ====================================================

                modal.querySelector(
                    '#sar-btn-mm'
                ).onclick =
                    async () => {

                        try {

                            /*
                             * Dentro del navegador de MetaMask:
                             *
                             * usamos injected.
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
                             * Fuera de MetaMask:
                             *
                             * abrir la app mediante deep link.
                             */

                            abrirMetaMaskApp();

                        } catch (e) {

                            console.error(
                                '❌ MetaMask:',
                                e
                            );

                            reject(e);

                            modal.remove();

                        }

                    };

                // ====================================================
                // RAINBOW
                // ====================================================

                modal.querySelector(
                    '#sar-btn-rainbow'
                ).onclick =
                    () => {

                        try {

                            abrirRainbowApp();

                        } catch (e) {

                            console.error(
                                '❌ Rainbow:',
                                e
                            );

                            reject(e);

                            modal.remove();

                        }

                    };

            }
        );

    }

    // ================================================================
    // LIMPIAR ESTADO
    // ================================================================

    function limpiarEstadoLocal() {

        currentAccount =
            null;

        currentProviderType =
            null;

        limpiarSesion();

    }

    // ================================================================
    // DESCONEXIÓN
    // ================================================================

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

        /*
         * Ponemos null antes de disconnect()
         * para evitar ciclos con el evento disconnect.
         */

        wcProvider =
            null;

        try {

            if (
                provider &&
                typeof provider.disconnect ===
                'function'
            ) {

                await provider.disconnect();

            }

        } catch (e) {

            console.warn(
                'Error desconectando WalletConnect:',
                e
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

    // ================================================================
    // CONEXIÓN PRINCIPAL
    // ================================================================

    async function conectar() {

        /*
         * ============================================================
         * MÓVIL
         * ============================================================
         *
         * Este es el cambio principal para el bug de Android Chrome.
         *
         * Chrome móvil puede tener un provider disponible o detectarlo
         * de forma no deseada.
         *
         * Por eso NO hacemos:
         *
         *   if (window.ethereum) conectarConInjected()
         *
         * en móvil.
         *
         * En móvil:
         *
         * MetaMask Browser / Coinbase Browser
         *   → injected
         *
         * Chrome / Safari
         *   → WalletConnect
         */

        if (
            esMovil()
        ) {

            /*
             * Si estamos realmente dentro del navegador
             * de MetaMask o Coinbase, usamos injected.
             */

            if (
                esNavegadorWalletInterno()
            ) {

                console.log(
                    '📱 Wallet interna detectada → injected'
                );

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

                return await conectarConInjected();

            }

            /*
             * Chrome/Safari móvil:
             *
             * WalletConnect.
             */

            console.log(
                '📱 Navegador móvil externo → WalletConnect'
            );

            return await conectarConWalletConnect();

        }

        /*
         * ============================================================
         * DESKTOP
         * ============================================================
         *
         * En escritorio sí utilizamos injected cuando existe.
         */

        if (
            tieneInjectedProvider()
        ) {

            console.log(
                '🖥️ Desktop con provider injected'
            );

            const estado =
                await validarSesionInjected();

            /*
             * Reutilizar conexión existente.
             */

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

            return await conectarConInjected();

        }

        /*
         * Desktop sin extensión:
         *
         * WalletConnect.
         */

        console.log(
            '🖥️ Desktop sin injected → WalletConnect'
        );

        return await conectarConWalletConnect();

    }

    // ================================================================
    // RESTAURAR SESIÓN
    // ================================================================

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
         * No confiamos únicamente en localStorage.
         *
         * Comprobamos que la wallet siga conectada.
         */

        if (
            sesion.tipo ===
            'injected'
        ) {

            /*
             * En móvil externo no debemos intentar
             * convertir automáticamente la sesión en injected.
             */

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
         * No iniciamos automáticamente una sesión nueva
         * solamente por encontrar localStorage.
         *
         * EthereumProvider debe restaurar la sesión
         * desde su propia store cuando sea necesario.
         */

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

    // ================================================================
    // OBTENER PROVIDER
    // ================================================================

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

    // ================================================================
    // OBTENER CUENTA
    // ================================================================

    function obtenerCuenta() {

        return currentAccount;

    }

    // ================================================================
    // TIPO DE PROVIDER
    // ================================================================

    function obtenerTipoProvider() {

        return currentProviderType;

    }

    // ================================================================
    // INFORMACIÓN RED
    // ================================================================

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

    // ================================================================
    // INFORMACIÓN WEB3
    // ================================================================

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

    // ================================================================
    // EXPORT
    // ================================================================

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

    // ================================================================
    // LOG INICIAL
    // ================================================================

    console.log(
        '================================================'
    );

    console.log(
        "🔐 SarWallet cargado"
    );

    console.log(
        '🌐 URL canónica:',
        PUBLIC_APP_URL
    );

    console.log(
        '⛓️ Red:',
        RED_ACTIVA
    );

    console.log(
        '🔢 Chain ID:',
        CHAIN_ID_OBJETIVO
    );

    console.log(
        '📱 Móvil:',
        esMovil()
    );

    console.log(
        '💉 Injected disponible:',
        tieneInjectedProvider()
    );

    console.log(
        '🦊 MetaMask Browser:',
        esNavegadorDeMetaMask()
    );

    console.log(
        '🔵 Coinbase Browser:',
        esNavegadorDeCoinbase()
    );

    console.log(
        '================================================'
    );

})();