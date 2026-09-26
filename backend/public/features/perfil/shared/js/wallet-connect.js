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
 * - navegador interno de MetaMask/Coinbase
 * - Chrome/Safari mediante WalletConnect
 *
 * Polygon Amoy:
 * Chain ID: 80002
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

    const RED = REDES[RED_ACTIVA];

    const CHAIN_ID_OBJETIVO = RED.chainId;
    const CHAIN_ID_HEX = RED.chainIdHex;

    // ================================================================
    // WALLETCONNECT
    // ================================================================

    const WALLETCONNECT_PROJECT_ID =
        'd080c5ef5c0e7109fd12f714d4ca25d5';

    /*
     * Se obtiene automáticamente del dominio actual.
     *
     * Esto evita que el deep link quede apuntando
     * a un dominio viejo de Railway.
     */

    const DAPP_DOMAIN =
        window.location.host;

    // ================================================================
    // ESTADO
    // ================================================================

    let wcProvider = null;
    let currentAccount = null;
    let currentProviderType = null;

    let desconectando = false;

    // ================================================================
    // DETECCIÓN
    // ================================================================

    function tieneInjectedProvider() {

        return (
            typeof window.ethereum !== 'undefined' &&
            window.ethereum !== null
        );

    }

    function esMovil() {

        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent);

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

        if (!tieneInjectedProvider()) {
            return false;
        }

        return Boolean(
            window.ethereum.isMetaMask
        );

    }

    function esNavegadorDeCoinbase() {

        if (!tieneInjectedProvider()) {
            return false;
        }

        return Boolean(
            window.ethereum.isCoinbaseWallet
        );

    }

    // ================================================================
    // DEEP LINK METAMASK
    // ================================================================

    function construirDeepLinkMetaMask() {

        const pathActual =
            window.location.pathname +
            window.location.search;

        return (
            'https://metamask.app.link/dapp/' +
            DAPP_DOMAIN +
            pathActual
        );

    }

    function abrirMetaMaskApp() {

        const deepLink =
            construirDeepLinkMetaMask();

        console.log(
            '🔗 Abriendo MetaMask:',
            deepLink
        );

        window.location.href =
            deepLink;

    }

    // ================================================================
    // DEEP LINK RAINBOW
    // ================================================================

    function abrirRainbowApp() {

        const url =
            encodeURIComponent(
                window.location.href
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
                    tipo: data.tipo,
                    address: data.address,
                    chainId: data.chainId,
                    timestamp: Date.now()
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

            if (!raw) {
                return null;
            }

            const data =
                JSON.parse(raw);

            if (
                !data.timestamp ||
                Date.now() - data.timestamp >
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

                            decimals: 18
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

        if (!tieneInjectedProvider()) {

            throw new Error(
                'INJECTED_NOT_AVAILABLE'
            );

        }

        /*
         * Aquí sí solicitamos permiso.
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

        let account =
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

    let eventosInjectedRegistrados =
        false;

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

                    currentAccount = null;

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

        if (
            !WALLETCONNECT_PROJECT_ID
        ) {

            throw new Error(
                'WALLETCONNECT_PROJECT_ID_NOT_CONFIGURED'
            );

        }

        /*
         * Carga dinámica para no aumentar
         * el peso inicial de la página.
         */

        const {
            EthereumProvider
        } = await import(
            'https://esm.sh/@walletconnect/ethereum-provider@2.17.0'
        );

        wcProvider =
            await EthereumProvider.init({

                projectId:
                    WALLETCONNECT_PROJECT_ID,

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
                        window.location.origin,

                    icons: [
                        window.location.origin +
                        '/favicon.ico'
                    ]

                }

            });

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

        if (!wcProvider) {
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

        /*
         * IMPORTANTE:
         *
         * No llamamos desconectar() aquí,
         * porque eso podría llamar nuevamente
         * a wcProvider.disconnect() y provocar
         * una cadena de eventos innecesaria.
         */

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
                ).onclick = cerrar;

                modal.onclick =
                    (e) => {

                        if (
                            e.target === modal
                        ) {

                            cerrar();

                        }

                    };

                /*
                 * WalletConnect:
                 * flujo principal en móvil externo.
                 */

                modal.querySelector(
                    '#sar-btn-wc'
                ).onclick = async () => {

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

                        resolve(result);

                    } catch (e) {

                        console.error(
                            'WalletConnect:',
                            e
                        );

                        btn.disabled =
                            false;

                        btn.textContent =
                            '🔗 Conectar con WalletConnect';

                        /*
                         * Si el usuario cerró
                         * WalletConnect, no mostramos
                         * error agresivo.
                         */

                        if (
                            e?.message ===
                            'USER_CANCELLED'
                        ) {

                            return;

                        }

                        alert(
                            'No se pudo conectar la wallet: ' +
                            (
                                e?.message ||
                                'Error desconocido'
                            )
                        );

                    }

                };

                /*
                 * MetaMask:
                 *
                 * Si estamos dentro del navegador
                 * MetaMask, usamos injected.
                 *
                 * Si estamos en Chrome móvil,
                 * abrimos MetaMask mediante deep link.
                 *
                 * La dApp se abrirá dentro de MetaMask.
                 * NO esperamos que Chrome reciba
                 * window.ethereum.
                 */

                modal.querySelector(
                    '#sar-btn-mm'
                ).onclick = async () => {

                    try {

                        if (
                            esNavegadorDeMetaMask()
                        ) {

                            const result =
                                await conectarConInjected();

                            modal.remove();

                            resolve(result);

                            return;

                        }

                        abrirMetaMaskApp();

                    } catch (e) {

                        console.error(
                            'MetaMask:',
                            e
                        );

                        reject(e);

                        modal.remove();

                    }

                };

                /*
                 * Rainbow:
                 *
                 * El deep link abre la dApp
                 * dentro de Rainbow.
                 */

                modal.querySelector(
                    '#sar-btn-rainbow'
                ).onclick = () => {

                    try {

                        abrirRainbowApp();

                    } catch (e) {

                        console.error(
                            'Rainbow:',
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

        if (desconectando) {
            return;
        }

        desconectando = true;

        const provider =
            wcProvider;

        /*
         * Ponemos null ANTES de llamar disconnect()
         * para evitar que el evento disconnect vuelva
         * a entrar en este flujo.
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
         * ------------------------------------------------------------
         * 1. Si existe injected provider:
         *
         *    Desktop
         *    MetaMask Browser
         *    Coinbase Browser
         * ------------------------------------------------------------
         */

        if (
            tieneInjectedProvider()
        ) {

            const estado =
                await validarSesionInjected();

            /*
             * Si ya existe una conexión real,
             * reutilizamos la cuenta.
             */

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

            /*
             * Si no hay cuenta conectada,
             * solicitar autorización.
             */

            return await conectarConInjected();

        }

        /*
         * ------------------------------------------------------------
         * 2. Sin injected provider:
         *
         *    Chrome Android
         *    Safari iPhone
         *    navegador desktop sin extensión
         *
         *    Usamos WalletConnect.
         * ------------------------------------------------------------
         */

        return await conectarConWalletConnect();

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
    // EXPORT
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

        abrirMetaMaskApp,

        abrirRainbowApp,

        redActual

    };

    console.log(
        '✅ SarWallet cargado | Red:',
        RED_ACTIVA,
        '| Chain ID:',
        CHAIN_ID_OBJETIVO,
        '| Dominio:',
        DAPP_DOMAIN
    );

})();