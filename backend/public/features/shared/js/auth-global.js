/* ================================================================
   AUTH-GLOBAL.JS — SARIEL'S ECOSYSTEM
   AUTENTICACIÓN GLOBAL DEL FRONTEND
   ================================================================
   ARCHIVO:  backend/public/features/shared/js/auth-global.js
   VERSIÓN:  2.0.1
   ================================================================

   RESPONSABILIDAD ÚNICA:
   Proveer a cada página del frontend un cliente Supabase listo
   para usar, con la sesión del usuario resuelta, y proteger
   las rutas que declaren ser privadas.

   ================================================================
   CAMBIOS v2.0.1
   ================================================================

   - AUTH_TIMEOUT_MS subió de 10000 a 30000 ms.
   - El catch de inicializarAuth() distingue entre:
       a) Timeout / error de red → NO redirige. Marca auth-ready.
       b) Error real de Supabase → sí redirige si la página es privada.
   - Reutiliza window.__sarielsSupabaseSingleton si ya existe
     (evita crear múltiples clientes Supabase, que era la causa
     real del bucle login ↔ perfil).
================================================================ */

'use strict';

(function () {

    if (window.__sarielsAuthGlobalLoaded) {
        return;
    }

    window.__sarielsAuthGlobalLoaded = true;


    /* ================================================================
       CONSTANTES
    ================================================================ */

    const AUTH_TIMEOUT_MS = 30000;

    const SUPABASE_PROJECT_URL =
        'https://zultnlogdoajehbswlih.supabase.co';

    const AUTH_REDIRECT = resolverAuthRedirect();

    const CONFIG_ENDPOINT = '/api/config/public';


    /* ================================================================
       ESTADO INTERNO
    ================================================================ */

    let cliente = null;
    let configPromise = null;
    let authPromise = null;
    let authSubscription = null;


    /* ================================================================
       ESTADO GLOBAL EXPUESTO
    ================================================================ */

    window.__sarielsAuthenticated = null;
    window.__sarielsAuthReady = false;

    window.supabaseClient = null;
    window.supabaseReady = null;
    window.sarielsAuthReady = null;
    window.supabaseError = null;

    window.sarielsSession = null;
    window.sarielsUser = null;


    /* ================================================================
       HELPERS
    ================================================================ */

    function resolverAuthRedirect() {
        const candidato =
            typeof window.SARIELS_AUTH_REDIRECT === 'string'
                ? window.SARIELS_AUTH_REDIRECT
                : '';

        if (
            candidato.startsWith('/') &&
            !candidato.startsWith('//')
        ) {
            return candidato;
        }

        return '/';
    }


    function paginaEsPublica() {
        return document.documentElement.hasAttribute('data-public');
    }


    function construirReturnTo() {
        const ruta =
            window.location.pathname +
            window.location.search +
            window.location.hash;

        if (
            !ruta.startsWith('/') ||
            ruta.startsWith('//') ||
            ruta === '/'
        ) {
            return null;
        }

        return ruta;
    }


    /* ================================================================
       AUTH-READY Y FOUC
    ================================================================ */

    function marcarAuthReady() {
        if (window.__sarielsAuthReady) {
            return;
        }

        window.__sarielsAuthReady = true;

        document.documentElement.classList.add('auth-ready');

        window.dispatchEvent(
            new CustomEvent('sariels:auth-ready')
        );
    }


    function redirigirSinSesion() {
        const returnTo = construirReturnTo();

        if (returnTo !== null) {
            try {
                localStorage.setItem('wallet_returnTo', returnTo);
            } catch (_) {}
        }

        if (window.location.pathname === AUTH_REDIRECT) {
            marcarAuthReady();
            return;
        }

        window.location.replace(AUTH_REDIRECT);
    }


    /* ================================================================
       ESTADO GLOBAL DE SESIÓN
    ================================================================ */

    function actualizarEstadoSesion(session) {
        const sesion = session || null;
        const usuario = sesion && sesion.user ? sesion.user : null;

        window.sarielsSession = sesion;
        window.sarielsUser = usuario;
        window.__sarielsAuthenticated = !!sesion;
    }


    function emitirAuthChange(event, session) {
        window.dispatchEvent(
            new CustomEvent(
                'sariels:auth-change',
                {
                    detail: {
                        event,
                        session: session || null,
                        user: session && session.user ? session.user : null
                    }
                }
            )
        );
    }


    /* ================================================================
       CONFIGURACIÓN PÚBLICA
    ================================================================ */

    function normalizarUrl(url) {
        return String(url).trim().replace(/\/+$/, '');
    }


    function validarConfiguracion(config) {
        if (
            !config ||
            typeof config.supabaseUrl !== 'string' ||
            !config.supabaseUrl ||
            typeof config.supabaseAnonKey !== 'string' ||
            !config.supabaseAnonKey
        ) {
            throw new Error(
                'La configuración pública de Supabase está incompleta.'
            );
        }

        const supabaseUrl = normalizarUrl(config.supabaseUrl);

        if (supabaseUrl !== SUPABASE_PROJECT_URL) {
            throw new Error(
                'La configuración pública de Supabase no apunta al proyecto oficial.'
            );
        }

        return {
            supabaseUrl,
            supabaseAnonKey: String(config.supabaseAnonKey).trim()
        };
    }


    /* ================================================================
       CLIENTE SUPABASE
       — v2.0.1: reutiliza singleton global si existe
    ================================================================ */

    function crearCliente(config) {

        /* ✅ Reutilizar singleton si ya existe */
        if (window.__sarielsSupabaseSingleton) {
            cliente = window.__sarielsSupabaseSingleton;
            window.supabaseClient = cliente;
            return cliente;
        }

        /* ✅ Reutilizar window.supabaseClient si ya existe */
        if (window.supabaseClient) {
            cliente = window.supabaseClient;
            window.__sarielsSupabaseSingleton = cliente;
            return cliente;
        }

        if (cliente) {
            window.supabaseClient = cliente;
            window.__sarielsSupabaseSingleton = cliente;
            return cliente;
        }

        const SDK = window.supabase;

        if (!SDK || typeof SDK.createClient !== 'function') {
            throw new Error(
                'El SDK de Supabase JS v2 no está disponible.'
            );
        }

        const configValidada = validarConfiguracion(config);

        window.SupabaseSDK = SDK;

        cliente = SDK.createClient(
            configValidada.supabaseUrl,
            configValidada.supabaseAnonKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            }
        );

        /* ✅ Exponer como singleton para que todos lo usen */
        window.supabaseClient = cliente;
        window.__sarielsSupabaseSingleton = cliente;

        return cliente;
    }


    async function cargarCliente() {

        /* ✅ Antes de cualquier cosa, verificar singleton */
        if (window.__sarielsSupabaseSingleton) {
            cliente = window.__sarielsSupabaseSingleton;
            window.supabaseClient = cliente;
            return cliente;
        }

        if (window.supabaseClient) {
            cliente = window.supabaseClient;
            window.__sarielsSupabaseSingleton = cliente;
            return cliente;
        }

        if (cliente) {
            window.supabaseClient = cliente;
            window.__sarielsSupabaseSingleton = cliente;
            return cliente;
        }

        if (configPromise) {
            return configPromise;
        }

        configPromise = (async () => {

            const response = await fetch(
                CONFIG_ENDPOINT,
                {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    cache: 'no-store'
                }
            );

            if (!response.ok) {
                throw new Error(
                    'HTTP ' + response.status +
                    ' al cargar ' + CONFIG_ENDPOINT + '.'
                );
            }

            const config = await response.json();

            if (!config || config.success === false) {
                throw new Error(
                    'La configuración pública de Supabase no es válida.'
                );
            }

            return crearCliente(config);

        })();

        try {
            return await configPromise;
        } catch (error) {
            configPromise = null;
            throw error;
        }
    }


    /* ================================================================
       SESIÓN Y AUTH
    ================================================================ */

    async function obtenerSesion() {
        const client = await cargarCliente();

        if (
            !client ||
            !client.auth ||
            typeof client.auth.getSession !== 'function'
        ) {
            throw new Error(
                'El cliente de Supabase Auth no está disponible.'
            );
        }

        const resultado = await client.auth.getSession();

        if (resultado && resultado.error) {
            throw resultado.error;
        }

        return (
            resultado &&
            resultado.data &&
            resultado.data.session
        ) || null;
    }


    function instalarListener(client) {
        if (authSubscription) {
            return;
        }

        if (
            !client ||
            !client.auth ||
            typeof client.auth.onAuthStateChange !== 'function'
        ) {
            throw new Error(
                'Supabase Auth no permite registrar onAuthStateChange.'
            );
        }

        const resultado = client.auth.onAuthStateChange(
            (event, session) => {
                actualizarEstadoSesion(session);
                emitirAuthChange(event, session);

                if (event === 'SIGNED_OUT') {
                    window.__sarielsAuthenticated = false;
                    window.sarielsSession = null;
                    window.sarielsUser = null;

                    if (!paginaEsPublica()) {
                        redirigirSinSesion();
                    }
                }
            }
        );

        authSubscription = (
            resultado &&
            resultado.data &&
            resultado.data.subscription
        ) || (
            resultado &&
            resultado.subscription
        ) || null;
    }


    /* ================================================================
       TIMEOUT
    ================================================================ */

    function conTimeout(promise, timeoutMs) {
        let timeoutId = null;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(
                    new Error(
                        'Tiempo de espera agotado al verificar la sesión.'
                    )
                );
            }, timeoutMs);
        });

        const limpiar = () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };

        return Promise.race([
            promise.then(
                (value) => { limpiar(); return value; },
                (error) => { limpiar(); throw error; }
            ),
            timeoutPromise
        ]);
    }


    /* ================================================================
       INICIALIZACIÓN
    ================================================================ */

    function esErrorDeTimeoutORed(error) {
        if (!error) {
            return false;
        }

        const mensaje = String(error.message || error || '');

        if (mensaje.indexOf('Tiempo de espera agotado') !== -1) {
            return true;
        }

        if (error.name === 'AbortError') {
            return true;
        }

        if (/failed to fetch|networkerror|network request failed/i.test(mensaje)) {
            return true;
        }

        return false;
    }


    async function inicializarAuth() {
        const esPublica = paginaEsPublica();

        try {
            const { client, session } = await conTimeout(
                (async () => {
                    const c = await cargarCliente();
                    const s = await obtenerSesion();
                    return { client: c, session: s };
                })(),
                AUTH_TIMEOUT_MS
            );

            window.supabaseError = null;

            actualizarEstadoSesion(session);

            instalarListener(client);

            if (!session && !esPublica) {
                redirigirSinSesion();
                return null;
            }

            marcarAuthReady();

            return client;

        } catch (error) {
            window.supabaseError = error;

            console.error(
                '[Auth Global] Error de autenticación:',
                error
            );

            if (esErrorDeTimeoutORed(error)) {
                console.warn(
                    '[Auth Global] Timeout o error de red. ' +
                    'No se redirige para evitar bucles.'
                );

                marcarAuthReady();
                return null;
            }

            window.__sarielsAuthenticated = false;
            window.sarielsSession = null;
            window.sarielsUser = null;

            if (!esPublica) {
                redirigirSinSesion();
            } else {
                marcarAuthReady();
            }

            return null;
        }
    }


    /* ================================================================
       API GLOBAL
    ================================================================ */

    window.getSupabaseClient = function () {
        return window.supabaseReady;
    };


    window.cfgEsperarSupabase = function () {
        return window.supabaseReady;
    };


    window.getSarielsAuthSession = function () {
        return window.sarielsSession || null;
    };


    window.getSarielsAuthUser = function () {
        return window.sarielsUser || null;
    };


    window.isSarielsAuthenticated = function () {
        return window.__sarielsAuthenticated === true;
    };


    window.isSarielsAuthReady = function () {
        return window.__sarielsAuthReady === true;
    };


    window.signOutSariels = async function () {
        const client = await window.supabaseReady;

        if (!client) {
            return false;
        }

        if (
            !client.auth ||
            typeof client.auth.signOut !== 'function'
        ) {
            throw new Error(
                'Supabase Auth no está disponible para cerrar sesión.'
            );
        }

        const resultado = await client.auth.signOut();

        if (resultado && resultado.error) {
            throw resultado.error;
        }

        return true;
    };


    /* ================================================================
       ARRANQUE
    ================================================================ */

    authPromise = inicializarAuth();

    window.supabaseReady = authPromise;
    window.sarielsAuthReady = authPromise;


    /* ================================================================
       API window.SarielsAuth
    ================================================================ */

    window.SarielsAuth = {

        ready: authPromise,

        wait: function () {
            return window.supabaseReady;
        },

        getClient: async function () {
            return window.supabaseReady;
        },

        getSession: async function () {
            const client = await window.supabaseReady;

            if (
                !client ||
                !client.auth ||
                typeof client.auth.getSession !== 'function'
            ) {
                return null;
            }

            const resultado = await client.auth.getSession();

            if (resultado && resultado.error) {
                throw resultado.error;
            }

            return (
                resultado &&
                resultado.data &&
                resultado.data.session
            ) || null;
        },

        requireAuth: async function () {
            const client = await window.supabaseReady;

            if (!client) {
                return null;
            }

            const session = await window.SarielsAuth.getSession();

            if (!session) {
                if (paginaEsPublica()) {
                    const returnTo = construirReturnTo();

                    if (returnTo !== null) {
                        try {
                            localStorage.setItem(
                                'wallet_returnTo',
                                returnTo
                            );
                        } catch (_) {}
                    }

                    window.location.replace(AUTH_REDIRECT);
                }

                return null;
            }

            return client;
        },

        signOut: async function () {
            try {
                await window.signOutSariels();
            } catch (error) {
                console.error(
                    '[Auth Global] Error al cerrar sesión:',
                    error
                );
            }

            window.location.replace(AUTH_REDIRECT);
            return true;
        }

    };


    authPromise.catch(function () {
        return null;
    });


})();