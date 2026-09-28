/* ================================================================
   APP.JS — SARIEL'S ECOSYSTEM
   PRODUCCIÓN — SUPABASE + AUTH + WALLET + LIVE
   POLYGON AMOY 80002
   ================================================================ */

'use strict';

/* ================================================================
   SUPABASE
================================================================ */

const SUPABASE_URL =
    'https://zultnlogdoajehbswlih.supabase.co';

const SUPABASE_ANON_KEY =
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

/*
 * El CDN de Supabase debe existir antes de este archivo.
 * Guardamos la referencia a la librería antes de crear el cliente.
 */
const SupabaseSDK = window.supabase;

if (
    !SupabaseSDK ||
    typeof SupabaseSDK.createClient !== 'function'
) {
    console.error(
        '❌ Supabase SDK no disponible.'
    );
}

/*
 * Reutilizar el cliente que index.html ya creó.
 * Si no existe, crearlo aquí.
 */
let supabaseClient = window.supabaseClient;

if (
    !supabaseClient &&
    SupabaseSDK &&
    typeof SupabaseSDK.createClient === 'function'
) {
    supabaseClient = SupabaseSDK.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );
}

if (!supabaseClient) {
    throw new Error(
        'No fue posible inicializar Supabase.'
    );
}

/*
 * Cliente oficial compartido por todo el ecosistema.
 */
window.supabaseClient = supabaseClient;

/*
 * Compatibilidad:
 * Algunas páginas antiguas utilizan window.supabase
 * como cliente. Lo conservamos como cliente después
 * de guardar la SDK original en window.SupabaseSDK.
 */
window.SupabaseSDK = SupabaseSDK;
window.supabase = supabaseClient;


/* ================================================================
   CONFIGURACIÓN WEB3
================================================================ */

const POLYGON_AMOY_CHAIN_ID = 80002;
const POLYGON_AMOY_HEX = '0x13882';

const POLYGON_AMOY_PARAMS = {
    chainId: POLYGON_AMOY_HEX,
    chainName: 'Polygon Amoy',
    nativeCurrency: {
        name: 'POL',
        symbol: 'POL',
        decimals: 18
    },
    rpcUrls: [
        'https://rpc-amoy.polygon.technology'
    ],
    blockExplorerUrls: [
        'https://amoy.polygonscan.com'
    ]
};


/* ================================================================
   VARIABLES GLOBALES
================================================================ */

let usuarioActual = null;
let walletConectada = false;
let web3 = null;
let appInstance = null;


/* ================================================================
   HELPERS GLOBALES
================================================================ */

function escapeHTML(texto) {

    if (
        texto === null ||
        texto === undefined
    ) {
        return '';
    }

    const div =
        document.createElement('div');

    div.textContent = String(texto);

    return div.innerHTML;
}


/* ================================================================
   TOAST
================================================================ */

function showToast(
    msg,
    type = ''
) {

    try {

        let t =
            document.getElementById('toast');

        if (!t) {

            t =
                document.createElement('div');

            t.id = 'toast';
            t.className = 'toast';

            document.body.appendChild(t);
        }

        t.textContent =
            String(msg);

        t.className =
            'toast show';

        t.classList.remove(
            'error',
            'warning',
            'success'
        );

        if (type === 'error') {
            t.classList.add('error');
        }

        if (type === 'warning') {
            t.classList.add('warning');
        }

        if (type === 'success') {
            t.classList.add('success');
        }

        clearTimeout(
            t._timeout
        );

        t._timeout =
            setTimeout(
                function () {
                    t.classList.remove(
                        'show'
                    );
                },
                3500
            );

    } catch (error) {

        console.warn(
            'Toast no disponible:',
            error
        );

        console.log(
            '[' +
            (type || 'info') +
            '] ' +
            msg
        );
    }
}


/* ================================================================
   SINCRONIZACIÓN GLOBAL DE USUARIO
================================================================ */

function establecerUsuario(user) {

    usuarioActual =
        user || null;

    window.usuarioActual =
        usuarioActual;

    if (appInstance) {
        appInstance.usuario =
            usuarioActual;
    }
}


/* ================================================================
   APP PRINCIPAL
================================================================ */

class GalletaDomoApp {

    constructor() {

        this.supabase =
            supabaseClient;

        /*
         * Nunca usar el dominio viejo de Railway.
         * Las llamadas API son same-origin.
         */
        this.apiUrl =
            '/api';

        this.usuario =
            null;

        this.wallet =
            null;

        this.tokens =
            0;

        this.isOnline =
            false;

        this._initialized =
            false;

        this._authListener =
            null;

        this._intervalos =
            [];
    }


    /* ============================================================
       INIT
    ============================================================ */

    async init() {

        if (this._initialized) {
            return;
        }

        this._initialized =
            true;

        console.log(
            "◈ Sariel's — App inicializada"
        );

        console.log(
            '🌐 API:',
            this.apiUrl
        );

        try {

            const {
                data,
                error
            } =
                await this.supabase.auth.getSession();

            if (error) {
                throw error;
            }

            const session =
                data?.session || null;

            if (session) {

                establecerUsuario(
                    session.user
                );

                await this.cargarTokens();

                await this.actualizarOnline(
                    true
                );

                this.actualizarUIUsuario(
                    session.user
                );

            } else {

                establecerUsuario(null);

                this.actualizarUIUsuario(
                    null
                );
            }


            /* ====================================================
               AUTH LISTENER
            ==================================================== */

            const authResult =
                this.supabase.auth.onAuthStateChange(
                    (event, session) => {

                        /*
                         * No hacemos operaciones pesadas directamente
                         * dentro del callback de Supabase.
                         */
                        Promise.resolve()
                            .then(
                                async () => {

                                    try {

                                        if (
                                            session
                                        ) {

                                            establecerUsuario(
                                                session.user
                                            );

                                        } else {

                                            establecerUsuario(
                                                null
                                            );
                                        }


                                        if (
                                            event ===
                                            'SIGNED_IN' &&
                                            session
                                        ) {

                                            await this.cargarTokens();

                                            await this.actualizarOnline(
                                                true
                                            );

                                            this.actualizarUIUsuario(
                                                session.user
                                            );

                                            showToast(
                                                '✅ Sesión iniciada correctamente',
                                                'success'
                                            );

                                        } else if (
                                            event ===
                                            'SIGNED_OUT'
                                        ) {

                                            this.isOnline =
                                                false;

                                            this.tokens =
                                                0;

                                            this.wallet =
                                                null;

                                            localStorage.removeItem(
                                                'sariels_wallet'
                                            );

                                            this.actualizarUIUsuario(
                                                null
                                            );

                                            this.actualizarUIWallet(
                                                null
                                            );

                                        } else if (
                                            event ===
                                            'TOKEN_REFRESHED' &&
                                            session
                                        ) {

                                            establecerUsuario(
                                                session.user
                                            );

                                        }

                                    } catch (error) {

                                        console.error(
                                            '❌ Error en auth listener:',
                                            error
                                        );
                                    }
                                }
                            );
                    }
                );

            this._authListener =
                authResult?.data?.subscription ||
                authResult?.subscription ||
                null;


            /* ====================================================
               WALLET LOCAL
            ==================================================== */

            const walletGuardada =
                localStorage.getItem(
                    'sariels_wallet'
                );

            if (walletGuardada) {

                this.wallet =
                    walletGuardada;

                walletConectada =
                    true;

                this.actualizarUIWallet(
                    walletGuardada
                );
            }


            /* ====================================================
               VISIBILIDAD
            ==================================================== */

            document.addEventListener(
                'visibilitychange',
                () => {

                    if (
                        document.visibilityState ===
                        'visible'
                    ) {

                        if (this.usuario) {
                            this.actualizarOnline(
                                true
                            );
                        }

                    } else {

                        if (this.usuario) {
                            this.actualizarOnline(
                                false
                            );
                        }
                    }
                }
            );


            /* ====================================================
               ANTES DE CERRAR
            ==================================================== */

            window.addEventListener(
                'beforeunload',
                () => {

                    if (this.usuario) {
                        this.actualizarOnline(
                            false
                        );
                    }
                }
            );


            console.log(
                '✅ App inicializada correctamente'
            );

        } catch (error) {

            console.error(
                '❌ Error en init:',
                error
            );

            showToast(
                '⚠️ Error al inicializar la aplicación',
                'error'
            );
        }
    }


    /* ============================================================
       DESTROY
    ============================================================ */

    destroy() {

        if (
            this._authListener &&
            typeof this._authListener.unsubscribe ===
            'function'
        ) {

            this._authListener.unsubscribe();

            this._authListener =
                null;
        }

        this._intervalos.forEach(
            function (interval) {
                clearInterval(interval);
            }
        );

        this._intervalos =
            [];

        this._initialized =
            false;
    }


    /* ============================================================
       TOKENS
    ============================================================ */

    async cargarTokens() {

        try {

            if (!this.usuario) {
                return 0;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .select('tokens')
                    .eq(
                        'id',
                        this.usuario.id
                    )
                    .maybeSingle();

            if (error) {
                throw error;
            }

            this.tokens =
                Number(data?.tokens || 0);

            return this.tokens;

        } catch (error) {

            console.error(
                'Error cargando tokens:',
                error
            );

            this.tokens =
                0;

            return 0;
        }
    }


    async obtenerTokens() {

        if (!this.usuario) {
            return 0;
        }

        await this.cargarTokens();

        return this.tokens;
    }


    async transferirTokens(
        destinoId,
        cantidad
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión para transferir',
                    'error'
                );

                return false;
            }

            cantidad =
                Number(cantidad);

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {

                showToast(
                    '⚠️ Cantidad inválida',
                    'error'
                );

                return false;
            }

            if (
                this.tokens <
                cantidad
            ) {

                showToast(
                    '⚠️ No tienes suficientes tokens',
                    'error'
                );

                return false;
            }

            const {
                error
            } =
                await this.supabase.rpc(
                    'transferir_tokens',
                    {
                        p_remitente_id:
                            this.usuario.id,

                        p_destinatario_id:
                            destinoId,

                        p_cantidad:
                            cantidad
                    }
                );

            if (error) {
                throw error;
            }

            await this.cargarTokens();

            showToast(
                `✅ ${cantidad} Es.stoks transferidos`,
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error transfiriendo tokens:',
                error
            );

            showToast(
                '❌ Error al transferir tokens',
                'error'
            );

            return false;
        }
    }


    /* ============================================================
       ESTADO ONLINE
    ============================================================ */

    async actualizarOnline(
        online
    ) {

        try {

            if (!this.usuario) {
                return;
            }

            const {
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .update({
                        online:
                            Boolean(online),

                        ultima_conexion:
                            new Date().toISOString()
                    })
                    .eq(
                        'id',
                        this.usuario.id
                    );

            if (error) {
                throw error;
            }

            this.isOnline =
                Boolean(online);

            const estadoEl =
                document.getElementById(
                    'estadoOnline'
                );

            if (estadoEl) {

                estadoEl.textContent =
                    online
                        ? '🟢 En línea'
                        : '⚪ Desconectado';
            }

        } catch (error) {

            console.error(
                'Error actualizando estado online:',
                error
            );
        }
    }


    async obtenerEstadoOnline(
        usuarioId
    ) {

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .select(
                        'online, ultima_conexion'
                    )
                    .eq(
                        'id',
                        usuarioId
                    )
                    .maybeSingle();

            if (error) {
                throw error;
            }

            return data;

        } catch (error) {

            console.error(
                'Error obteniendo estado online:',
                error
            );

            return null;
        }
    }


    /* ============================================================
       ESTADÍSTICAS
    ============================================================ */

    async obtenerEstadisticas() {

        try {

            if (!this.usuario) {
                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from(
                        'estadisticas_usuarios'
                    )
                    .select('*')
                    .eq(
                        'user_id',
                        this.usuario.id
                    )
                    .maybeSingle();

            if (
                error &&
                error.code !== 'PGRST116'
            ) {
                throw error;
            }

            return data || null;

        } catch (error) {

            console.error(
                'Error obteniendo estadísticas:',
                error
            );

            return null;
        }
    }


    async actualizarEstadisticas() {

        try {

            if (!this.usuario) {
                return;
            }

            const stats =
                await this.obtenerEstadisticas();

            if (stats) {

                await this.supabase
                    .from(
                        'estadisticas_usuarios'
                    )
                    .update({
                        tokens_actuales:
                            this.tokens,

                        ultima_actividad:
                            new Date().toISOString()
                    })
                    .eq(
                        'user_id',
                        this.usuario.id
                    );

            } else {

                await this.supabase
                    .from(
                        'estadisticas_usuarios'
                    )
                    .insert({
                        user_id:
                            this.usuario.id,

                        tokens_actuales:
                            this.tokens,

                        ultima_actividad:
                            new Date().toISOString()
                    });
            }

        } catch (error) {

            console.error(
                'Error actualizando estadísticas:',
                error
            );
        }
    }


    /* ============================================================
       REGISTRO
    ============================================================ */

    async registrarUsuario(
        email,
        password,
        nombre
    ) {

        try {

            email =
                String(email || '')
                    .trim();

            password =
                String(password || '');

            nombre =
                String(nombre || '')
                    .trim();

            if (!email || !password) {

                showToast(
                    '⚠️ Correo y contraseña son obligatorios',
                    'error'
                );

                return null;
            }

            if (password.length < 6) {

                showToast(
                    '⚠️ La contraseña debe tener al menos 6 caracteres',
                    'error'
                );

                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase.auth.signUp({

                    email:
                        email,

                    password:
                        password,

                    options: {
                        data: {
                            nombre:
                                nombre ||
                                'Explorador',

                            role:
                                'user'
                        }
                    }
                });

            if (error) {
                throw error;
            }

            showToast(
                data?.session
                    ? '✅ Cuenta creada y sesión iniciada'
                    : '✅ Cuenta creada. Verifica tu correo.',
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error registrando usuario:',
                error
            );

            let msg =
                error?.message ||
                'Error desconocido';

            if (
                msg
                    .toLowerCase()
                    .includes('already registered')
            ) {

                msg =
                    '⚠️ Este correo ya está registrado';
            }

            showToast(
                '❌ ' + msg,
                'error'
            );

            throw error;
        }
    }


    /* ============================================================
       LOGIN
    ============================================================ */

    async iniciarSesion(
        email,
        password
    ) {

        try {

            email =
                String(email || '')
                    .trim();

            password =
                String(password || '');

            if (!email || !password) {

                showToast(
                    '⚠️ Correo y contraseña son obligatorios',
                    'error'
                );

                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase.auth
                    .signInWithPassword({
                        email:
                            email,

                        password:
                            password
                    });

            if (error) {
                throw error;
            }

            if (data?.user) {
                establecerUsuario(
                    data.user
                );
            }

            showToast(
                '✅ Sesión iniciada correctamente',
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error iniciando sesión:',
                error
            );

            let msg =
                error?.message ||
                'Error desconocido';

            if (
                msg
                    .toLowerCase()
                    .includes(
                        'invalid login credentials'
                    )
            ) {

                msg =
                    '⚠️ Correo o contraseña incorrectos';
            }

            showToast(
                '❌ ' + msg,
                'error'
            );

            throw error;
        }
    }


    /* ============================================================
       LOGOUT
    ============================================================ */

    async cerrarSesion() {

        if (
            !confirm(
                '¿Seguro que quieres cerrar sesión?'
            )
        ) {
            return false;
        }

        try {

            await this.actualizarOnline(
                false
            );

            const {
                error
            } =
                await this.supabase.auth.signOut();

            if (error) {
                throw error;
            }

            localStorage.removeItem(
                'sariels_wallet'
            );

            this.wallet =
                null;

            walletConectada =
                false;

            establecerUsuario(
                null
            );

            this.tokens =
                0;

            this.actualizarUIUsuario(
                null
            );

            this.actualizarUIWallet(
                null
            );

            showToast(
                '🔌 Sesión cerrada',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error cerrando sesión:',
                error
            );

            showToast(
                '❌ Error al cerrar sesión',
                'error'
            );

            return false;
        }
    }


    /* ============================================================
       RECUPERAR CONTRASEÑA
    ============================================================ */

    async recuperarContraseña(
        email
    ) {

        try {

            email =
                String(email || '')
                    .trim();

            if (!email) {

                showToast(
                    '⚠️ Ingresa tu correo',
                    'error'
                );

                return false;
            }

            const {
                error
            } =
                await this.supabase.auth
                    .resetPasswordForEmail(
                        email,
                        {
                            redirectTo:
                                window.location.origin +
                                '/actualizar-contraseña.html'
                        }
                    );

            if (error) {
                throw error;
            }

            showToast(
                '📧 Te enviamos un enlace a tu correo.',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error recuperando contraseña:',
                error
            );

            showToast(
                '❌ No se pudo enviar el enlace.',
                'error'
            );

            return false;
        }
    }


    async actualizarContraseña(
        nuevaContraseña
    ) {

        try {

            if (
                !nuevaContraseña ||
                nuevaContraseña.length < 6
            ) {

                showToast(
                    '⚠️ La contraseña debe tener al menos 6 caracteres',
                    'error'
                );

                return false;
            }

            const {
                error
            } =
                await this.supabase.auth
                    .updateUser({
                        password:
                            nuevaContraseña
                    });

            if (error) {
                throw error;
            }

            showToast(
                '✅ Contraseña actualizada correctamente.',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error actualizando contraseña:',
                error
            );

            showToast(
                '❌ Error al actualizar la contraseña.',
                'error'
            );

            return false;
        }
    }


    /* ============================================================
       WALLET — POLYGON AMOY
    ============================================================ */

    async conectarWallet() {

        if (
            typeof window.ethereum ===
            'undefined'
        ) {

            showToast(
                '⚠️ Abre Sariel\'s desde MetaMask o usa WalletConnect.',
                'warning'
            );

            return false;
        }

        try {

            /*
             * Solicitar cuenta.
             */
            const accounts =
                await window.ethereum.request({
                    method:
                        'eth_requestAccounts'
                });

            if (
                !accounts ||
                !accounts.length
            ) {
                return false;
            }

            /*
             * Cambiar a Polygon Amoy.
             */
            let chainId =
                await window.ethereum.request({
                    method:
                        'eth_chainId'
                });

            if (
                String(chainId).toLowerCase() !==
                POLYGON_AMOY_HEX
            ) {

                try {

                    await window.ethereum.request({
                        method:
                            'wallet_switchEthereumChain',

                        params: [
                            {
                                chainId:
                                    POLYGON_AMOY_HEX
                            }
                        ]
                    });

                } catch (switchError) {

                    /*
                     * 4902 = red no agregada.
                     */
                    if (
                        switchError &&
                        switchError.code ===
                        4902
                    ) {

                        await window.ethereum.request({
                            method:
                                'wallet_addEthereumChain',

                            params: [
                                POLYGON_AMOY_PARAMS
                            ]
                        });

                    } else {

                        showToast(
                            '⚠️ Cambia MetaMask a Polygon Amoy.',
                            'warning'
                        );

                        return false;
                    }
                }

                chainId =
                    await window.ethereum.request({
                        method:
                            'eth_chainId'
                    });
            }

            if (
                String(chainId).toLowerCase() !==
                POLYGON_AMOY_HEX
            ) {

                showToast(
                    '⚠️ La wallet debe estar en Polygon Amoy.',
                    'warning'
                );

                return false;
            }


            /*
             * Web3 opcional.
             */
            if (
                typeof Web3 !==
                'undefined'
            ) {

                web3 =
                    new Web3(
                        window.ethereum
                    );
            }


            const wallet =
                accounts[0];

            this.wallet =
                wallet;

            walletConectada =
                true;

            localStorage.setItem(
                'sariels_wallet',
                wallet
            );

            this.actualizarUIWallet(
                wallet
            );

            showToast(
                '✅ Wallet conectada en Polygon Amoy: ' +
                wallet.slice(0, 6) +
                '...' +
                wallet.slice(-4),
                'success'
            );


            if (this.usuario) {

                await this.vincularWallet(
                    wallet
                );
            }

            return true;

        } catch (error) {

            console.error(
                'Error conectando wallet:',
                error
            );

            if (
                error &&
                error.code === 4001
            ) {

                showToast(
                    '⚠️ Conexión cancelada',
                    'warning'
                );

            } else {

                showToast(
                    '❌ Error al conectar wallet',
                    'error'
                );
            }

            return false;
        }
    }


    async vincularWallet(
        walletAddress
    ) {

        try {

            if (!this.usuario) {
                return false;
            }

            const {
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .update({
                        wallet:
                            walletAddress
                    })
                    .eq(
                        'id',
                        this.usuario.id
                    );

            if (error) {
                throw error;
            }

            return true;

        } catch (error) {

            console.error(
                'Error vinculando wallet:',
                error
            );

            return false;
        }
    }


    async desconectarWallet() {

        if (
            !confirm(
                '¿Seguro que quieres desconectar tu wallet?'
            )
        ) {
            return false;
        }

        localStorage.removeItem(
            'sariels_wallet'
        );

        this.wallet =
            null;

        walletConectada =
            false;

        web3 =
            null;

        this.actualizarUIWallet(
            null
        );

        showToast(
            '🔌 Wallet desconectada',
            'warning'
        );

        return true;
    }


    /* ============================================================
       TRANSMISIONES
    ============================================================ */

    async crearTransmision(
        datos
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión primero',
                    'error'
                );

                return null;
            }

            if (
                !datos ||
                !datos.titulo ||
                datos.titulo.length < 3
            ) {

                showToast(
                    '⚠️ El título debe tener al menos 3 caracteres',
                    'error'
                );

                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from('transmisiones')
                    .insert({
                        streamer_id:
                            this.usuario.id,

                        titulo:
                            datos.titulo,

                        descripcion:
                            datos.descripcion ||
                            '',

                        tags:
                            datos.tags ||
                            [],

                        tipo_transmision:
                            datos.tipo ||
                            'pago',

                        precio:
                            datos.precio ||
                            0,

                        precio_suscripcion:
                            datos.precioSuscripcion ||
                            0,

                        fecha_inicio:
                            new Date().toISOString(),

                        estado:
                            'en_vivo'
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            showToast(
                '◉ Transmisión iniciada: ' +
                escapeHTML(
                    datos.titulo
                ),
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error creando transmisión:',
                error
            );

            showToast(
                '❌ Error: ' +
                (error?.message || 'No se pudo crear'),
                'error'
            );

            return null;
        }
    }


    async obtenerTransmisionesActivas() {

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('transmisiones')
                    .select(
                        '*, usuarios(nombre, avatar)'
                    )
                    .eq(
                        'estado',
                        'en_vivo'
                    )
                    .order(
                        'fecha_inicio',
                        {
                            ascending:
                                false
                        }
                    );

            if (error) {
                throw error;
            }

            return data || [];

        } catch (error) {

            console.error(
                'Error obteniendo transmisiones:',
                error
            );

            return [];
        }
    }


    async obtenerTransmisionesProgramadas() {

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('transmisiones')
                    .select(
                        '*, usuarios(nombre, avatar)'
                    )
                    .eq(
                        'estado',
                        'programada'
                    )
                    .order(
                        'fecha_inicio',
                        {
                            ascending:
                                true
                        }
                    );

            if (error) {
                throw error;
            }

            return data || [];

        } catch (error) {

            console.error(
                'Error obteniendo transmisiones programadas:',
                error
            );

            return [];
        }
    }


    /* ============================================================
       CHAT LIVE
    ============================================================ */

    async enviarMensaje(
        transmisionId,
        mensaje
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión para chatear',
                    'error'
                );

                return null;
            }

            mensaje =
                String(mensaje || '')
                    .trim();

            if (!mensaje) {

                showToast(
                    '⚠️ Escribe un mensaje',
                    'warning'
                );

                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from('mensajes_live')
                    .insert({
                        transmision_id:
                            transmisionId,

                        usuario_id:
                            this.usuario.id,

                        mensaje:
                            mensaje,

                        nombre_usuario:
                            this.usuario
                                .user_metadata
                                ?.nombre ||
                            'Anónimo'
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            return data;

        } catch (error) {

            console.error(
                'Error enviando mensaje:',
                error
            );

            showToast(
                '❌ Error al enviar mensaje',
                'error'
            );

            return null;
        }
    }


    async obtenerMensajes(
        transmisionId
    ) {

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('mensajes_live')
                    .select('*')
                    .eq(
                        'transmision_id',
                        transmisionId
                    )
                    .order(
                        'created_at',
                        {
                            ascending:
                                true
                        }
                    )
                    .limit(50);

            if (error) {
                throw error;
            }

            return data || [];

        } catch (error) {

            console.error(
                'Error obteniendo mensajes:',
                error
            );

            return [];
        }
    }


    suscribirseChat(
        transmisionId,
        callback
    ) {

        return this.supabase
            .channel(
                `chat-${transmisionId}`
            )
            .on(
                'postgres_changes',
                {
                    event:
                        'INSERT',

                    schema:
                        'public',

                    table:
                        'mensajes_live',

                    filter:
                        `transmision_id=eq.${transmisionId}`
                },
                function (payload) {

                    if (callback) {
                        callback(
                            payload.new
                        );
                    }
                }
            )
            .subscribe();
    }


    /* ============================================================
       PAGOS LIVE
    ============================================================ */

    async registrarPago(
        transmisionId,
        monto,
        metodo
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión para pagar',
                    'error'
                );

                return null;
            }

            monto =
                Number(monto);

            if (
                !Number.isFinite(monto) ||
                monto <= 0
            ) {

                showToast(
                    '⚠️ Monto inválido',
                    'error'
                );

                return null;
            }

            const comision =
                monto * 0.5;

            const montoStreamer =
                monto * 0.5;

            const idempotencyKey =
                'pago_' +
                this.usuario.id +
                '_' +
                transmisionId +
                '_' +
                Date.now() +
                '_' +
                Math.random()
                    .toString(36)
                    .substring(2, 8);

            const {
                data,
                error
            } =
                await this.supabase
                    .from(
                        'pagos_transmision'
                    )
                    .insert({
                        transmision_id:
                            transmisionId,

                        espectador_id:
                            this.usuario.id,

                        monto_pagado:
                            monto,

                        comision_sariels:
                            comision,

                        monto_streamer:
                            montoStreamer,

                        metodo_pago:
                            metodo,

                        tipo_pago:
                            'acceso',

                        estado:
                            'completado',

                        idempotency_key:
                            idempotencyKey
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            showToast(
                `✅ Pago de $${monto} MXN completado`,
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error registrando pago:',
                error
            );

            showToast(
                '❌ Error en pago',
                'error'
            );

            return null;
        }
    }


    async verificarAcceso(
        transmisionId
    ) {

        try {

            if (!this.usuario) {
                return false;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from(
                        'pagos_transmision'
                    )
                    .select('id')
                    .eq(
                        'transmision_id',
                        transmisionId
                    )
                    .eq(
                        'espectador_id',
                        this.usuario.id
                    )
                    .eq(
                        'estado',
                        'completado'
                    )
                    .limit(1);

            if (error) {
                throw error;
            }

            return Boolean(
                data &&
                data.length
            );

        } catch (error) {

            console.error(
                'Error verificando acceso:',
                error
            );

            return false;
        }
    }


    /* ============================================================
       SUSCRIPCIONES
    ============================================================ */

    async suscribirse(
        streamerId,
        precioMensual
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión para suscribirte',
                    'error'
                );

                return null;
            }

            precioMensual =
                Number(precioMensual);

            if (
                !Number.isFinite(
                    precioMensual
                ) ||
                precioMensual <= 0
            ) {

                showToast(
                    '⚠️ Precio inválido',
                    'error'
                );

                return null;
            }

            const {
                data,
                error
            } =
                await this.supabase
                    .from('suscripciones')
                    .insert({
                        streamer_id:
                            streamerId,

                        espectador_id:
                            this.usuario.id,

                        precio_mensual:
                            precioMensual,

                        activo:
                            true,

                        proximo_pago:
                            new Date(
                                Date.now() +
                                30 *
                                24 *
                                60 *
                                60 *
                                1000
                            ).toISOString()
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            showToast(
                `✅ Suscripción mensual de $${precioMensual} MXN activada`,
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error suscribiéndose:',
                error
            );

            showToast(
                '❌ Error al suscribirse',
                'error'
            );

            return null;
        }
    }


    /* ============================================================
       PROMOCIONES
    ============================================================ */

    async activarPromocion(
        transmisionId,
        nivel,
        horas
    ) {

        try {

            if (!this.usuario) {

                showToast(
                    '⚠️ Inicia sesión para promocionar',
                    'error'
                );

                return null;
            }

            nivel =
                Number(nivel);

            horas =
                Number(horas);

            if (
                ![1, 2, 3].includes(nivel)
            ) {

                showToast(
                    '⚠️ Nivel inválido',
                    'error'
                );

                return null;
            }

            if (
                !Number.isFinite(horas) ||
                horas <= 0
            ) {

                showToast(
                    '⚠️ Horas inválidas',
                    'error'
                );

                return null;
            }

            const precios = {
                1: 50,
                2: 150,
                3: 300
            };

            const prioridades = {
                1: 3,
                2: 2,
                3: 1
            };

            const costo =
                precios[nivel] *
                horas;

            const {
                data,
                error
            } =
                await this.supabase
                    .from(
                        'promociones_streamer'
                    )
                    .insert({
                        streamer_id:
                            this.usuario.id,

                        transmision_id:
                            transmisionId,

                        nivel_promocion:
                            nivel,

                        costo_promocion:
                            costo,

                        duracion_promocion:
                            horas,

                        posicion_prioridad:
                            prioridades[nivel],

                        activo:
                            true
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            const {
                error:
                    updateError
            } =
                await this.supabase
                    .from(
                        'transmisiones'
                    )
                    .update({
                        promocion_activa:
                            true,

                        nivel_promocion:
                            nivel,

                        costo_promocion:
                            costo
                    })
                    .eq(
                        'id',
                        transmisionId
                    );

            if (updateError) {
                console.warn(
                    '⚠️ No se pudo actualizar transmisión:',
                    updateError
                );
            }

            showToast(
                `🚀 Promoción nivel ${nivel} activada`,
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error activando promoción:',
                error
            );

            showToast(
                '❌ Error activando promoción',
                'error'
            );

            return null;
        }
    }


    /* ============================================================
       UI USUARIO
    ============================================================ */

    actualizarUIUsuario(
        user
    ) {

        const loginBtn =
            document.getElementById(
                'loginBtn'
            );

        const userInfo =
            document.getElementById(
                'userInfo'
            );

        /*
         * UI actual del index.html.
         */
        const sessionInfo =
            document.getElementById(
                'sessionInfo'
            );

        const userEmail =
            document.getElementById(
                'userEmail'
            );

        const logoutBtn =
            document.getElementById(
                'logoutBtn'
            );


        try {

            if (user) {

                const nombre =
                    user.user_metadata?.nombre ||
                    user.email ||
                    'Usuario';


                if (loginBtn) {
                    loginBtn.style.display =
                        'none';
                }


                /*
                 * Sistema antiguo.
                 */
                if (userInfo) {

                    userInfo.style.display =
                        'flex';

                    userInfo.innerHTML =
                        `
                        <span style="font-size:0.7rem;color:var(--gold);">
                            ${escapeHTML(nombre)}
                            <span style="font-size:0.5rem;color:var(--text-muted);">
                                (${this.tokens} Es.stoks)
                            </span>
                        </span>
                        <button
                            onclick="app.cerrarSesion()"
                            style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.6rem;"
                        >
                            ✕
                        </button>
                        `;
                }


                /*
                 * Sistema actual.
                 */
                if (sessionInfo) {
                    sessionInfo.style.display =
                        'flex';
                }

                if (userEmail) {

                    userEmail.textContent =
                        user.email ||
                        nombre;
                }

                if (logoutBtn) {

                    logoutBtn.style.display =
                        'inline-block';
                }


            } else {

                if (loginBtn) {

                    loginBtn.style.display =
                        'inline-flex';
                }

                if (userInfo) {

                    userInfo.style.display =
                        'none';

                    userInfo.innerHTML =
                        '';
                }

                if (userEmail) {

                    userEmail.textContent =
                        'No autenticado';
                }

                if (logoutBtn) {

                    logoutBtn.style.display =
                        'none';
                }
            }

        } catch (error) {

            console.error(
                'Error actualizando UI usuario:',
                error
            );
        }
    }


    /* ============================================================
       UI WALLET
    ============================================================ */

    actualizarUIWallet(
        wallet
    ) {

        const walletBtn =
            document.getElementById(
                'walletBtn'
            );

        const walletInfo =
            document.getElementById(
                'walletInfo'
            );

        if (
            !walletBtn &&
            !walletInfo
        ) {
            return;
        }

        try {

            if (wallet) {

                if (walletBtn) {

                    walletBtn.style.display =
                        'none';
                }

                if (walletInfo) {

                    walletInfo.style.display =
                        'flex';

                    walletInfo.innerHTML =
                        `
                        <span style="font-size:0.6rem;color:var(--text-muted);">
                            🟢 ${wallet.slice(0, 6)}...${wallet.slice(-4)}
                        </span>
                        <button
                            onclick="app.desconectarWallet()"
                            style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.5rem;"
                        >
                            ✕
                        </button>
                        `;
                }

            } else {

                if (walletBtn) {

                    walletBtn.style.display =
                        'inline-flex';
                }

                if (walletInfo) {

                    walletInfo.style.display =
                        'none';

                    walletInfo.innerHTML =
                        '';
                }
            }

        } catch (error) {

            console.error(
                'Error actualizando UI wallet:',
                error
            );
        }
    }


    /* ============================================================
       TOKENS UI
    ============================================================ */

    async actualizarUITokens() {

        await this.cargarTokens();

        this.actualizarUIUsuario(
            this.usuario
        );

        const tokenBadge =
            document.getElementById(
                'tokenBadgeCantidad'
            );

        if (tokenBadge) {

            tokenBadge.textContent =
                this.tokens;
        }
    }
}


/* ================================================================
   CREAR APP
================================================================ */

const app =
    new GalletaDomoApp();

appInstance =
    app;

window.app =
    app;

window.usuarioActual =
    usuarioActual;

window.showToast =
    showToast;

window.escapeHTML =
    escapeHTML;


/* ================================================================
   GET SESSION
================================================================ */

async function getSession() {

    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth
                .getSession();

        if (error) {
            throw error;
        }

        const session =
            data?.session || null;

        if (session) {
            establecerUsuario(
                session.user
            );
        }

        return session;

    } catch (error) {

        console.error(
            '❌ Error en getSession:',
            error
        );

        return null;
    }
}

window.getSession =
    getSession;


/* ================================================================
   GET SUPABASE
================================================================ */

function getSupabase() {
    return supabaseClient;
}

window.getSupabase =
    getSupabase;


/* ================================================================
   CONFIG WEB3
================================================================ */

window.SARIELS_WEB3 = {
    chainId:
        POLYGON_AMOY_CHAIN_ID,

    chainIdHex:
        POLYGON_AMOY_HEX,

    chainName:
        'Polygon Amoy',

    rpcUrl:
        'https://rpc-amoy.polygon.technology',

    explorer:
        'https://amoy.polygonscan.com'
};


/* ================================================================
   INICIALIZACIÓN
================================================================ */

document.addEventListener(
    'DOMContentLoaded',
    function () {

        try {

            console.log(
                "◈ Sariel's App — lista"
            );

            console.log(
                '🌐 API:',
                app.apiUrl
            );

            console.log(
                '◉ Supabase conectado'
            );

            console.log(
                '⛓️ Polygon Amoy:',
                POLYGON_AMOY_CHAIN_ID
            );

            const walletGuardada =
                localStorage.getItem(
                    'sariels_wallet'
                );

            if (walletGuardada) {

                app.wallet =
                    walletGuardada;

                walletConectada =
                    true;

                app.actualizarUIWallet(
                    walletGuardada
                );
            }

            app.init();

        } catch (error) {

            console.error(
                '❌ Error en inicialización:',
                error
            );

            showToast(
                '⚠️ Error al inicializar la aplicación. Recarga la página.',
                'error'
            );
        }
    }
);


/* ================================================================
   LIMPIEZA
================================================================ */

window.addEventListener(
    'beforeunload',
    function () {

        if (
            app &&
            typeof app.destroy ===
            'function'
        ) {

            app.destroy();
        }
    }
);


/* ================================================================
   EVENTOS DE WALLET
================================================================ */

if (
    typeof window.ethereum !==
    'undefined'
) {

    window.ethereum.on(
        'accountsChanged',
        function (accounts) {

            if (
                !accounts ||
                !accounts.length
            ) {

                app.wallet =
                    null;

                walletConectada =
                    false;

                localStorage.removeItem(
                    'sariels_wallet'
                );

                app.actualizarUIWallet(
                    null
                );

                return;
            }

            const wallet =
                accounts[0];

            app.wallet =
                wallet;

            walletConectada =
                true;

            localStorage.setItem(
                'sariels_wallet',
                wallet
            );

            app.actualizarUIWallet(
                wallet
            );
        }
    );


    window.ethereum.on(
        'chainChanged',
        function (chainId) {

            if (
                String(chainId).toLowerCase() !==
                POLYGON_AMOY_HEX
            ) {

                showToast(
                    '⚠️ MetaMask está fuera de Polygon Amoy.',
                    'warning'
                );
            }
        }
    );
}


/* ================================================================
   FIN APP.JS
================================================================ */