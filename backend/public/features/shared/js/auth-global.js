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
   FLUJO
   ================================================================

   1.  La página carga este script ANTES de sus propios scripts.
   2.  Se lee el atributo <html data-public> para saber si la
       página es pública o privada.
   3.  Se obtiene la configuración pública desde /api/config/public.
   4.  Se valida que la configuración apunte al proyecto oficial.
   5.  Se crea un único cliente Supabase.
   6.  Se resuelve la sesión actual.
   7.  Se instala un listener de onAuthStateChange.
   8.  Según el estado:
       a.  Hay sesión          → marcar auth-ready.
       b.  No hay sesión:
           i.   Página privada → redirigir a "/" sin marcar
                                 auth-ready (evita FOUC).
           ii.  Página pública → marcar auth-ready igual.
   9.  Si el usuario cierra sesión desde otra pestaña:
       a.  Página privada → redirigir.
       b.  Página pública → no hacer nada.

   ================================================================
   CAMBIOS v2.0.1 (fix del bucle infinito login ↔ perfil)
   ================================================================

   - AUTH_TIMEOUT_MS subió de 10000 a 30000 ms.
     Motivo: en redes lentas o cuando Supabase tarda, el timeout
     de 10 s disparaba la redirección a "/" aunque el usuario
     SÍ tuviera sesión, generando un bucle infinito entre
     /index.html y /features/perfil/perfil.html.

   - El catch de inicializarAuth() ahora distingue entre:
       a) Timeout / error de red → NO redirige. Marca auth-ready
          y deja que perfil.js (que ya sabe manejar la sesión)
          decida qué hacer.
       b) Error real de Supabase → sí redirige si la página es
          privada, como antes.

   ================================================================
   ATRIBUTOS HTML
   ================================================================

   <html lang="es" data-public>
       La página es pública. No se redirige aunque no haya sesión.

   <html lang="es">
       La página es privada (por defecto). Si no hay sesión,
       se redirige a "/".

   ================================================================
   VARIABLES GLOBALES
   ================================================================

   window.SARIELS_AUTH_REDIRECT (opcional, antes de cargar el script)
       Cambia la ruta de redirección. Por defecto: "/".

   ================================================================
   GARANTÍAS
   ================================================================

   - No contiene SERVICE_ROLE.
   - No contiene secretos.
   - Usa únicamente la configuración pública de /api/config/public.
   - Valida que la config apunte al proyecto Supabase oficial.
   - Un único cliente Supabase por página.
   - Listener de auth sin fugas de memoria.
   - Salvaguarda de 30 segundos contra bloqueos.

   ================================================================
   API PÚBLICA
   ================================================================

   window.supabaseClient             → cliente Supabase (o null).
   window.supabaseReady              → Promise<cliente|null>.
   window.sarielsAuthReady           → alias de supabaseReady.
   window.sarielsSession             → sesión actual (o null).
   window.sarielsUser                → usuario actual (o null).
   window.SarielsAuth.ready          → Promise<cliente|null>.
   window.SarielsAuth.wait()         → Promise<cliente|null>.
   window.SarielsAuth.getClient()    → Promise<cliente|null>.
   window.SarielsAuth.getSession()   → Promise<session|null>.
   window.SarielsAuth.requireAuth()  → Promise<cliente|null>.
   window.SarielsAuth.signOut()      → Promise<boolean>.
   window.getSupabaseClient()        → Promise<cliente|null>.
   window.cfgEsperarSupabase()       → Promise<cliente|null>.
   window.getSarielsAuthSession()    → session|null.
   window.getSarielsAuthUser()       → user|null.
   window.isSarielsAuthenticated()   → boolean.
   window.isSarielsAuthReady()       → boolean.
   window.signOutSariels()           → Promise<boolean>.

   ================================================================
   EVENTOS
   ================================================================

   'sariels:auth-ready'   → la autenticación terminó de resolver.
   'sariels:auth-change'  → cambió el estado de autenticación
                            (event, session, user).
================================================================ */

'use strict';

(function () {

    /* ================================================================
       GUARDIA CONTRA CARGA DUPLICADA
    ================================================================ */

    if (window.__sarielsAuthGlobalLoaded) {
        return;
    }

    window.__sarielsAuthGlobalLoaded = true;


    /* ================================================================
       CONSTANTES
    ================================================================ */

    /**
     * Tiempo máximo total para resolver la autenticación.
     * v2.0.1: subido de 10000 a 30000 para evitar redirecciones
     * prematuras en redes lentas que causaban un bucle infinito
     * entre el login y el perfil.
     * @type {number}
     */
    const AUTH_TIMEOUT_MS = 30000;

    /** @type {string} URL del proyecto Supabase oficial. */
    const SUPABASE_PROJECT_URL =
        'https://zultnlogdoajehbswlih.supabase.co';

    /** @type {string} Ruta a la que se redirige si no hay sesión. */
    const AUTH_REDIRECT = resolverAuthRedirect();

    /** @type {string} Endpoint público que entrega la config de Supabase. */
    const CONFIG_ENDPOINT = '/api/config/public';


    /* ================================================================
       ESTADO INTERNO DEL MÓDULO
    ================================================================ */

    /** @type {object|null} Cliente Supabase ya creado. */
    let cliente = null;

    /** @type {Promise|null} Promesa en vuelo del fetch de config. */
    let configPromise = null;

    /** @type {Promise|null} Promesa principal de inicialización. */
    let authPromise = null;

    /** @type {object|null} Suscripción activa de onAuthStateChange. */
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

    /**
     * Resuelve la ruta de redirección.
     * Si el llamador definió window.SARIELS_AUTH_REDIRECT como
     * una ruta interna válida, se respeta. Si no, se usa "/".
     *
     * @returns {string}
     */
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


    /**
     * Determina si la página es pública.
     * Una página es pública si su <html> tiene el atributo
     * [data-public]. En cualquier otro caso, es privada.
     *
     * @returns {boolean}
     */
    function paginaEsPublica() {

        return document.documentElement.hasAttribute('data-public');

    }


    /**
     * Construye una ruta interna segura para guardar como
     * "returnTo". Si la ruta actual no es válida, no se guarda.
     *
     * @returns {string|null}
     */
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

    /**
     * Marca la página como lista para mostrarse.
     * Añade la clase .auth-ready al <html> y dispara el evento
     * 'sariels:auth-ready'. Idempotente.
     */
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


    /**
     * Redirige al usuario a AUTH_REDIRECT.
     * Si la página es privada, NO marca auth-ready antes de
     * redirigir: esto evita que el contenido protegido se
     * muestre durante los milisegundos previos a la navegación.
     * Si ya estamos en AUTH_REDIRECT, marca auth-ready para
     * evitar una página en blanco indefinida.
     */
    function redirigirSinSesion() {

        const returnTo = construirReturnTo();

        if (returnTo !== null) {

            try {
                localStorage.setItem('wallet_returnTo', returnTo);
            } catch (_) {
                /* localStorage puede fallar en modo privado */
            }

        }

        if (window.location.pathname === AUTH_REDIRECT) {

            /*
             * Estamos ya en el destino. Evitamos un bucle
             * infinito y mostramos la página para no dejar
             * al usuario en blanco.
             */

            marcarAuthReady();

            return;

        }

        window.location.replace(AUTH_REDIRECT);

    }


    /* ================================================================
       ESTADO GLOBAL DE SESIÓN
    ================================================================ */

    /**
     * Actualiza las variables globales con el estado de la sesión.
     *
     * @param {object|null} session Sesión de Supabase Auth.
     */
    function actualizarEstadoSesion(session) {

        const sesion = session || null;
        const usuario = sesion && sesion.user ? sesion.user : null;

        window.sarielsSession = sesion;
        window.sarielsUser = usuario;
        window.__sarielsAuthenticated = !!sesion;

    }


    /**
     * Emite un evento global cada vez que cambia el estado de auth.
     *
     * @param {string} event   Nombre del evento de Supabase.
     * @param {object|null} session Sesión actual.
     */
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

    /**
     * Normaliza una URL eliminando barras finales.
     *
     * @param {string} url
     * @returns {string}
     */
    function normalizarUrl(url) {

        return String(url).trim().replace(/\/+$/, '');

    }


    /**
     * Valida la forma de la configuración pública.
     * Lanza si falta algún campo.
     *
     * @param {object} config
     * @returns {{supabaseUrl: string, supabaseAnonKey: string}}
     */
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
    ================================================================ */

    /**
     * Crea (o reutiliza) el cliente Supabase con la configuración
     * validada. Si ya existe, lo devuelve.
     *
     * @param {{supabaseUrl: string, supabaseAnonKey: string}} config
     * @returns {object} Cliente Supabase.
     */
    function crearCliente(config) {

        if (cliente) {
            window.supabaseClient = cliente;
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

        window.supabaseClient = cliente;

        return cliente;

    }


    /**
     * Obtiene la configuración pública desde el backend y crea el
     * cliente Supabase. Memoiza la promesa para no repetir el fetch.
     *
     * @returns {Promise<object>} Cliente Supabase.
     */
    async function cargarCliente() {

        if (cliente) {
            window.supabaseClient = cliente;
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

    /**
     * Devuelve la sesión actual usando el cliente Supabase.
     *
     * @returns {Promise<object|null>} Sesión o null.
     */
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


    /**
     * Instala el listener de onAuthStateChange. Si ya existe una
     * suscripción activa, no hace nada (idempotente).
     *
     * @param {object} client Cliente Supabase.
     */
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

    /**
     * Envuelve una promesa con un timeout global.
     *
     * @template T
     * @param {Promise<T>} promise
     * @param {number} timeoutMs
     * @returns {Promise<T>}
     */
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

    /**
     * Determina si un error es de timeout o de red (no es
     * "el usuario no tiene sesión"). En ese caso NO hay que
     * redirigir: hay que dejar la página visible y que perfil.js
     * maneje la sesión con sus propios reintentos.
     *
     * @param {*} error
     * @returns {boolean}
     */
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


    /**
     * Inicializa la autenticación global.
     *
     * v2.0.1: si falla por timeout o error de red, NO redirige.
     * Solo redirige si Supabase respondió claramente que no hay
     * sesión (o si hay un error de configuración real). Esto
     * rompe el bucle infinito entre login y perfil.
     *
     * @returns {Promise<object|null>} Cliente Supabase o null.
     */
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

            /*
             * Fix v2.0.1:
             * Si el error es de timeout o de red, NO redirigimos.
             * Solo marcamos auth-ready para que la página se
             * muestre, y dejamos que perfil.js (que ya sabe
             * manejar la sesión con reintentos) decida qué hacer.
             *
             * Esto evita el bucle infinito login ↔ perfil cuando
             * Supabase tarda unos segundos en responder.
             */
            if (esErrorDeTimeoutORed(error)) {

                console.warn(
                    '[Auth Global] Timeout o error de red. ' +
                    'No se redirige para evitar bucles. ' +
                    'Se marca auth-ready y se deja la página visible.'
                );

                marcarAuthReady();

                return null;

            }

            /*
             * Error real (config inválida, SDK no disponible, etc.).
             * Comportamiento original: si la página es privada,
             * redirigir a "/".
             */
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
       API GLOBAL — FUNCIONES SUELTAS (compatibilidad)
    ================================================================ */

    /**
     * Devuelve el cliente Supabase (como promesa).
     * @returns {Promise<object|null>}
     */
    window.getSupabaseClient = function () {
        return window.supabaseReady;
    };


    /**
     * Alias de getSupabaseClient para compatibilidad con
     * config-layout.js.
     * @returns {Promise<object|null>}
     */
    window.cfgEsperarSupabase = function () {
        return window.supabaseReady;
    };


    /**
     * Devuelve la sesión actual sin esperar la promesa.
     * @returns {object|null}
     */
    window.getSarielsAuthSession = function () {
        return window.sarielsSession || null;
    };


    /**
     * Devuelve el usuario actual sin esperar la promesa.
     * @returns {object|null}
     */
    window.getSarielsAuthUser = function () {
        return window.sarielsUser || null;
    };


    /**
     * ¿Hay sesión activa?
     * @returns {boolean}
     */
    window.isSarielsAuthenticated = function () {
        return window.__sarielsAuthenticated === true;
    };


    /**
     * ¿Terminó de resolver auth-global?
     * @returns {boolean}
     */
    window.isSarielsAuthReady = function () {
        return window.__sarielsAuthReady === true;
    };


    /**
     * Cierra la sesión en Supabase. No redirige.
     * @returns {Promise<boolean>}
     */
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
       API GLOBAL — OBJETO window.SarielsAuth
    ================================================================ */

    window.SarielsAuth = {

        /**
         * Promesa principal de inicialización.
         * Se resuelve con el cliente Supabase o null.
         * @type {Promise<object|null>}
         */
        ready: authPromise,


        /**
         * Alias de ready().
         * @returns {Promise<object|null>}
         */
        wait: function () {
            return window.supabaseReady;
        },


        /**
         * Devuelve el cliente Supabase.
         * @returns {Promise<object|null>}
         */
        getClient: async function () {
            return window.supabaseReady;
        },


        /**
         * Devuelve la sesión actual.
         * @returns {Promise<object|null>}
         */
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


        /**
         * Exige sesión. Si la página es privada, auth-global ya
         * habrá redirigido al cargar si no había sesión. Si la
         * página es pública y no hay sesión, fuerza el redirect
         * por compatibilidad con código antiguo.
         *
         * @returns {Promise<object|null>}
         */
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


        /**
         * Cierra la sesión y redirige a "/".
         * @returns {Promise<boolean>}
         */
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


    /*
     * Evita un rechazo no manejado.
     */

    authPromise.catch(function () {
        return null;
    });


})();