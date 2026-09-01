/* ================================================================
   APP.JS - PRODUCCIÓN
   SARIEL'S / GALLETA DOMO
   Supabase + Auth + Es.stoks + Wallet + Live + Chat + Pagos
   ================================================================ */

'use strict';

/* ================================================================
   CONFIGURACIÓN
   ================================================================ */

const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY =
    'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

const API_URL =
    window.location.origin + '/api';

/* ================================================================
   SUPABASE
   ================================================================ */

if (
    typeof window.supabase === 'undefined' ||
    typeof window.supabase.createClient !== 'function'
) {
    console.error(
        '❌ Supabase JS no está cargado.'
    );
    throw new Error(
        'Supabase JS no está disponible.'
    );
}

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        }
    );

/*
 * IMPORTANTE:
 * No sobrescribimos window.supabase con el cliente.
 * Algunas páginas pueden utilizar window.supabase.createClient.
 */
window.supabaseClient = supabaseClient;

/* ================================================================
   VARIABLES GLOBALES
   ================================================================ */

let usuarioActual = null;
let walletConectada = false;
let web3 = null;
let appInstance = null;

/* ================================================================
   UTILIDADES
   ================================================================ */

function escapeHTML(texto) {
    if (texto === null || texto === undefined) {
        return '';
    }

    const div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
}

function normalizarWallet(wallet) {
    return typeof wallet === 'string'
        ? wallet.trim().toLowerCase()
        : '';
}

function generarIdempotencyKey(prefijo = 'op') {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return `${prefijo}_${crypto.randomUUID()}`;
    }

    return `${prefijo}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 12)}`;
}

function numeroSeguro(valor, fallback = 0) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : fallback;
}

/* ================================================================
   TOAST
   ================================================================ */

function showToast(msg, type = '') {
    try {
        let toast = document.getElementById('toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = String(msg);
        toast.className = 'toast show';

        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'warning') {
            toast.classList.add('warning');
        } else if (type === 'success') {
            toast.classList.add('success');
        }

        clearTimeout(toast._timeout);

        toast._timeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);

    } catch (error) {
        console.warn('Toast no disponible:', error);
        console.log(`[${type || 'info'}] ${msg}`);
    }
}

/* ================================================================
   CLASE PRINCIPAL
   ================================================================ */

class GalletaDomoApp {

    constructor() {
        this.supabase = supabaseClient;
        this.apiUrl = API_URL;

        this.usuario = null;
        this.wallet = null;
        this.tokens = 0;

        this.isOnline = false;

        this._initialized = false;
        this._authListener = null;
        this._visibilityHandler = null;
        this._beforeUnloadHandler = null;
        this._intervalos = [];
    }

    /* ============================================================
       INIT
       ============================================================ */

    async init() {

        if (this._initialized) {
            return;
        }

        this._initialized = true;

        console.log("◈ Sariel's - App inicializada");
        console.log('🌐 API:', this.apiUrl);

        try {

            const {
                data,
                error
            } = await this.supabase.auth.getSession();

            if (error) {
                throw error;
            }

            const session = data?.session || null;

            if (session?.user) {

                this.usuario = session.user;
                usuarioActual = session.user;

                await this.cargarPerfilUsuario();
                await this.cargarTokens();
                await this.actualizarOnline(true);

                this.actualizarUIUsuario(
                    session.user
                );

                if (this.wallet) {
                    this.actualizarUIWallet(
                        this.wallet
                    );
                }
            }

            this._authListener =
                this.supabase.auth.onAuthStateChange(
                    (event, session) => {

                        /*
                         * No hacemos operaciones Supabase
                         * pesadas directamente dentro del callback
                         * de onAuthStateChange.
                         */
                        setTimeout(async () => {

                            try {

                                if (
                                    event === 'SIGNED_IN' &&
                                    session?.user
                                ) {

                                    this.usuario =
                                        session.user;

                                    usuarioActual =
                                        session.user;

                                    await this.cargarPerfilUsuario();
                                    await this.cargarTokens();
                                    await this.actualizarOnline(true);

                                    this.actualizarUIUsuario(
                                        session.user
                                    );

                                } else if (
                                    event === 'SIGNED_OUT'
                                ) {

                                    this.usuario = null;
                                    usuarioActual = null;
                                    this.tokens = 0;
                                    this.wallet = null;
                                    this.isOnline = false;

                                    localStorage.removeItem(
                                        'sariels_wallet'
                                    );

                                    this.actualizarUIUsuario(
                                        null
                                    );

                                    this.actualizarUIWallet(
                                        null
                                    );
                                }

                            } catch (error) {

                                console.error(
                                    'Error manejando auth:',
                                    error
                                );

                            }

                        }, 0);
                    }
                );

            const walletGuardada =
                localStorage.getItem(
                    'sariels_wallet'
                );

            if (walletGuardada) {

                this.wallet =
                    normalizarWallet(
                        walletGuardada
                    );

                walletConectada = true;

                this.actualizarUIWallet(
                    this.wallet
                );
            }

            this._beforeUnloadHandler = () => {

                /*
                 * beforeunload no garantiza que una llamada
                 * asíncrona termine. Se intenta actualizar,
                 * pero la autoridad real del estado online
                 * debe quedar en backend/Realtime si se requiere
                 * presencia estricta.
                 */
                if (this.usuario) {
                    this.actualizarOnline(false);
                }
            };

            window.addEventListener(
                'beforeunload',
                this._beforeUnloadHandler
            );

            this._visibilityHandler = () => {

                if (!this.usuario) {
                    return;
                }

                if (
                    document.visibilityState ===
                    'visible'
                ) {

                    this.actualizarOnline(true);

                } else {

                    this.actualizarOnline(false);

                }
            };

            document.addEventListener(
                'visibilitychange',
                this._visibilityHandler
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
       PERFIL
       ============================================================ */

    async cargarPerfilUsuario() {

        if (!this.usuario) {
            return null;
        }

        try {

            const {
                data,
                error
            } = await this.supabase
                .from('usuarios')
                .select(`
                    id,
                    email,
                    nombre,
                    handle,
                    bio,
                    avatar_url,
                    wallet_address,
                    tokens,
                    tokens_acumulados,
                    progreso_canje,
                    puede_canjear,
                    nft_canjeado,
                    domos,
                    online,
                    ultima_conexion,
                    offline_desde,
                    verificado
                `)
                .eq('id', this.usuario.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (data) {

                this.tokens =
                    numeroSeguro(
                        data.tokens
                    );

                if (
                    data.wallet_address &&
                    !this.wallet
                ) {

                    this.wallet =
                        normalizarWallet(
                            data.wallet_address
                        );

                    walletConectada = true;

                    localStorage.setItem(
                        'sariels_wallet',
                        this.wallet
                    );
                }
            }

            return data || null;

        } catch (error) {

            console.error(
                'Error cargando perfil:',
                error
            );

            return null;
        }
    }

    /* ============================================================
       TOKENS / ES.STOKS
       ============================================================ */

    async cargarTokens() {

        if (!this.usuario) {
            this.tokens = 0;
            return 0;
        }

        try {

            const {
                data,
                error
            } = await this.supabase
                .from('usuarios')
                .select('tokens')
                .eq('id', this.usuario.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            this.tokens =
                numeroSeguro(
                    data?.tokens
                );

            return this.tokens;

        } catch (error) {

            console.error(
                'Error cargando tokens:',
                error
            );

            return this.tokens || 0;
        }
    }

    async obtenerTokens() {

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

            if (!destinoId) {

                showToast(
                    '⚠️ Destinatario inválido',
                    'error'
                );

                return false;
            }

            const monto =
                numeroSeguro(cantidad);

            if (monto <= 0) {

                showToast(
                    '⚠️ Cantidad inválida',
                    'error'
                );

                return false;
            }

            /*
             * La validación visual del saldo NO es seguridad.
             * La RPC es la autoridad para impedir saldo negativo
             * y realizar la operación atómicamente.
             */
            const idempotencyKey =
                generarIdempotencyKey(
                    'transfer'
                );

            const {
                data,
                error
            } = await this.supabase.rpc(
                'transferir_tokens',
                {
                    p_destino_id:
                        destinoId,

                    p_cantidad:
                        monto,

                    p_idempotency_key:
                        idempotencyKey
                }
            );

            if (error) {
                throw error;
            }

            await this.cargarTokens();

            this.actualizarUIUsuario(
                this.usuario
            );

            showToast(
                `✅ ${monto} Es.stoks transferidos`,
                'success'
            );

            return data ?? true;

        } catch (error) {

            console.error(
                'Error transfiriendo tokens:',
                error
            );

            showToast(
                '❌ No fue posible realizar la transferencia',
                'error'
            );

            return false;
        }
    }

    /* ============================================================
       ESTADO ONLINE
       ============================================================ */

    async actualizarOnline(online) {

        if (!this.usuario) {
            return false;
        }

        try {

            const ahora =
                new Date().toISOString();

            const cambios = {
                online: Boolean(online),
                ultima_conexion: ahora
            };

            if (!online) {
                cambios.offline_desde = ahora;
            } else {
                cambios.offline_desde = null;
            }

            const {
                error
            } = await this.supabase
                .from('usuarios')
                .update(cambios)
                .eq('id', this.usuario.id);

            if (error) {
                throw error;
            }

            this.isOnline =
                Boolean(online);

            const estado =
                document.getElementById(
                    'estadoOnline'
                );

            if (estado) {

                estado.textContent =
                    online
                        ? '🟢 En línea'
                        : '⚪ Desconectado';

                estado.style.color =
                    online
                        ? 'var(--success)'
                        : 'var(--text-muted)';
            }

            return true;

        } catch (error) {

            console.error(
                'Error actualizando online:',
                error
            );

            return false;
        }
    }

    async obtenerEstadoOnline(
        usuarioId
    ) {

        if (!usuarioId) {
            return null;
        }

        try {

            const {
                data,
                error
            } = await this.supabase
                .from('usuarios')
                .select(
                    'online, ultima_conexion, offline_desde'
                )
                .eq('id', usuarioId)
                .maybeSingle();

            if (error) {
                throw error;
            }

            return data || null;

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

        if (!this.usuario) {
            return null;
        }

        try {

            const {
                data,
                error
            } = await this.supabase
                .from('estadisticas_usuarios')
                .select('*')
                .eq(
                    'user_id',
                    this.usuario.id
                )
                .maybeSingle();

            if (error) {
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

        if (!this.usuario) {
            return null;
        }

        try {

            const ahora =
                new Date().toISOString();

            const existentes =
                await this.obtenerEstadisticas();

            if (existentes) {

                const {
                    data,
                    error
                } = await this.supabase
                    .from('estadisticas_usuarios')
                    .update({
                        tokens_actuales:
                            this.tokens,

                        ultima_actividad:
                            ahora
                    })
                    .eq(
                        'user_id',
                        this.usuario.id
                    )
                    .select()
                    .maybeSingle();

                if (error) {
                    throw error;
                }

                return data;

            } else {

                const {
                    data,
                    error
                } = await this.supabase
                    .from('estadisticas_usuarios')
                    .insert({
                        user_id:
                            this.usuario.id,

                        tokens_actuales:
                            this.tokens,

                        ultima_actividad:
                            ahora
                    })
                    .select()
                    .single();

                if (error) {
                    throw error;
                }

                return data;
            }

        } catch (error) {

            console.error(
                'Error actualizando estadísticas:',
                error
            );

            return null;
        }
    }

    /* ============================================================
       AUTENTICACIÓN
       ============================================================ */

    async registrarUsuario(
        email,
        password,
        nombre
    ) {

        try {

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
            } = await this.supabase.auth.signUp({
                email:
                    email.trim(),

                password,

                options: {
                    data: {
                        nombre:
                            nombre?.trim() ||
                            'Explorador',

                        role: 'user'
                    }
                }
            });

            if (error) {
                throw error;
            }

            showToast(
                data.session
                    ? '✅ Cuenta creada y sesión iniciada'
                    : '✅ Cuenta creada. Verifica tu correo',
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error registrando usuario:',
                error
            );

            let mensaje =
                error?.message ||
                'No fue posible crear la cuenta';

            const lower =
                mensaje.toLowerCase();

            if (
                lower.includes(
                    'already registered'
                )
            ) {
                mensaje =
                    'Este correo ya está registrado';
            }

            showToast(
                '❌ ' + mensaje,
                'error'
            );

            throw error;
        }
    }

    async iniciarSesion(
        email,
        password
    ) {

        try {

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
                await this.supabase.auth.signInWithPassword({
                    email:
                        email.trim(),

                    password
                });

            if (error) {
                throw error;
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

            const lower =
                String(
                    error?.message || ''
                ).toLowerCase();

            let mensaje =
                'No fue posible iniciar sesión';

            if (
                lower.includes(
                    'invalid login credentials'
                )
            ) {
                mensaje =
                    'Correo o contraseña incorrectos';
            }

            showToast(
                '❌ ' + mensaje,
                'error'
            );

            throw error;
        }
    }

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

            this.wallet = null;
            walletConectada = false;

            this.usuario = null;
            usuarioActual = null;
            this.tokens = 0;

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
                '❌ Error cerrando sesión',
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
                        email.trim(),
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
                '📧 Te enviamos un enlace para recuperar tu contraseña',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error recuperando contraseña:',
                error
            );

            showToast(
                '❌ No fue posible procesar la recuperación',
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
                '✅ Contraseña actualizada correctamente',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error actualizando contraseña:',
                error
            );

            showToast(
                '❌ Error al actualizar la contraseña',
                'error'
            );

            return false;
        }
    }

    /* ============================================================
       WALLET
       ============================================================ */

    async conectarWallet() {

        if (
            typeof window.ethereum ===
            'undefined'
        ) {

            showToast(
                '⚠️ Instala MetaMask para continuar',
                'warning'
            );

            return false;
        }

        try {

            if (
                typeof Web3 ===
                'undefined'
            ) {

                showToast(
                    '⚠️ Web3 no está cargado',
                    'error'
                );

                return false;
            }

            web3 =
                new Web3(
                    window.ethereum
                );

            const accounts =
                await window.ethereum.request({
                    method:
                        'eth_requestAccounts'
                });

            if (
                !accounts ||
                accounts.length === 0
            ) {
                return false;
            }

            const wallet =
                normalizarWallet(
                    accounts[0]
                );

            this.wallet = wallet;
            walletConectada = true;

            localStorage.setItem(
                'sariels_wallet',
                wallet
            );

            this.actualizarUIWallet(
                wallet
            );

            if (this.usuario) {
                await this.vincularWallet(
                    wallet
                );
            }

            showToast(
                '✅ Wallet conectada: ' +
                wallet.slice(0, 6) +
                '...' +
                wallet.slice(-4),
                'success'
            );

            return wallet;

        } catch (error) {

            console.error(
                'Error conectando wallet:',
                error
            );

            if (
                error?.code === 4001
            ) {

                showToast(
                    '⚠️ Conexión rechazada',
                    'warning'
                );

            } else {

                showToast(
                    '❌ No fue posible conectar la wallet',
                    'error'
                );
            }

            return false;
        }
    }

    async vincularWallet(
        walletAddress
    ) {

        if (!this.usuario) {
            return false;
        }

        const wallet =
            normalizarWallet(
                walletAddress
            );

        if (!wallet) {
            return false;
        }

        try {

            const {
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .update({
                        wallet_address:
                            wallet
                    })
                    .eq(
                        'id',
                        this.usuario.id
                    );

            if (error) {
                throw error;
            }

            this.wallet = wallet;
            walletConectada = true;

            return true;

        } catch (error) {

            console.error(
                'Error vinculando wallet:',
                error
            );

            showToast(
                '❌ No fue posible vincular la wallet',
                'error'
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

        try {

            /*
             * Desconectar del navegador NO significa borrar
             * necesariamente la wallet registrada en Supabase.
             *
             * Aquí solamente quitamos la sesión local.
             */
            localStorage.removeItem(
                'sariels_wallet'
            );

            this.wallet = null;
            walletConectada = false;
            web3 = null;

            this.actualizarUIWallet(
                null
            );

            showToast(
                '🔌 Wallet desconectada',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error desconectando wallet:',
                error
            );

            return false;
        }
    }

    /* ============================================================
       RECUPERACIÓN POR WALLET
       ============================================================ */

    async recuperarConWallet() {

        if (
            typeof window.ethereum ===
            'undefined'
        ) {

            showToast(
                '⚠️ Conecta MetaMask primero',
                'error'
            );

            return false;
        }

        try {

            const accounts =
                await window.ethereum.request({
                    method:
                        'eth_requestAccounts'
                });

            if (
                !accounts ||
                accounts.length === 0
            ) {
                return false;
            }

            const wallet =
                normalizarWallet(
                    accounts[0]
                );

            const {
                data,
                error
            } =
                await this.supabase
                    .from('usuarios')
                    .select('email')
                    .ilike(
                        'wallet_address',
                        wallet
                    )
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data?.email) {

                showToast(
                    '⚠️ No hay una cuenta asociada a esta wallet',
                    'warning'
                );

                return false;
            }

            return await this.recuperarContraseña(
                data.email
            );

        } catch (error) {

            console.error(
                'Error recuperando con wallet:',
                error
            );

            showToast(
                '❌ No fue posible recuperar la cuenta',
                'error'
            );

            return false;
        }
    }

    /* ============================================================
       TRANSMISIONES
       ============================================================ */

    async crearTransmision(
        datos = {}
    ) {

        if (!this.usuario) {

            showToast(
                '⚠️ Inicia sesión primero',
                'error'
            );

            return null;
        }

        const titulo =
            String(
                datos.titulo || ''
            ).trim();

        if (titulo.length < 3) {

            showToast(
                '⚠️ El título debe tener al menos 3 caracteres',
                'error'
            );

            return null;
        }

        try {

            /*
             * La tabla real NO tiene columna tags.
             */
            const registro = {
                streamer_id:
                    this.usuario.id,

                titulo,

                descripcion:
                    String(
                        datos.descripcion || ''
                    ),

                room_name:
                    datos.roomName ||
                    datos.room_name ||
                    `live_${this.usuario.id}_${Date.now()}`,

                tipo_transmision:
                    datos.tipo ||
                    datos.tipo_transmision ||
                    'pago',

                precio:
                    numeroSeguro(
                        datos.precio,
                        0
                    ),

                precio_suscripcion:
                    numeroSeguro(
                        datos.precioSuscripcion ??
                        datos.precio_suscripcion,
                        0
                    ),

                estado:
                    datos.estado ||
                    'en_vivo',

                is_live:
                    datos.is_live ??
                    true,

                viewers_count:
                    0,

                donaciones_totales:
                    0,

                promocion_activa:
                    false,

                fecha_inicio:
                    new Date().toISOString(),

                categoria:
                    datos.categoria ||
                    null,

                precio_acceso:
                    numeroSeguro(
                        datos.precioAcceso ??
                        datos.precio_acceso ??
                        datos.precio,
                        0
                    )
            };

            const {
                data,
                error
            } =
                await this.supabase
                    .from('transmisiones')
                    .insert(registro)
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            showToast(
                '◉ Transmisión iniciada',
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error creando transmisión:',
                error
            );

            showToast(
                '❌ No fue posible iniciar la transmisión',
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
                    .select(`
                        *,
                        usuarios (
                            nombre,
                            avatar_url,
                            handle
                        )
                    `)
                    .eq(
                        'estado',
                        'en_vivo'
                    )
                    .eq(
                        'is_live',
                        true
                    )
                    .order(
                        'fecha_inicio',
                        {
                            ascending: false
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
                    .select(`
                        *,
                        usuarios (
                            nombre,
                            avatar_url,
                            handle
                        )
                    `)
                    .eq(
                        'estado',
                        'programada'
                    )
                    .order(
                        'fecha_inicio',
                        {
                            ascending: true
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

        if (!this.usuario) {

            showToast(
                '⚠️ Inicia sesión para chatear',
                'error'
            );

            return null;
        }

        const texto =
            String(
                mensaje || ''
            ).trim();

        if (!texto) {

            showToast(
                '⚠️ Escribe un mensaje',
                'warning'
            );

            return null;
        }

        if (!transmisionId) {
            return null;
        }

        try {

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
                            texto,

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
                    .select(`
                        id,
                        transmision_id,
                        usuario_id,
                        mensaje,
                        nombre_usuario,
                        created_at
                    `)
                    .eq(
                        'transmision_id',
                        transmisionId
                    )
                    .order(
                        'created_at',
                        {
                            ascending: true
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

        if (!transmisionId) {
            return null;
        }

        return this.supabase
            .channel(
                `chat-${transmisionId}-${Date.now()}`
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
                payload => {

                    if (
                        typeof callback ===
                        'function'
                    ) {
                        callback(
                            payload.new
                        );
                    }
                }
            )
            .subscribe();
    }

    async cancelarSuscripcionChat(
        channel
    ) {

        if (!channel) {
            return;
        }

        try {

            await this.supabase
                .removeChannel(
                    channel
                );

        } catch (error) {

            console.error(
                'Error cerrando canal:',
                error
            );
        }
    }

    /* ============================================================
       PAGOS
       ============================================================ */

    async registrarPago(
        transmisionId,
        monto,
        metodo
    ) {

        if (!this.usuario) {

            showToast(
                '⚠️ Inicia sesión para pagar',
                'error'
            );

            return null;
        }

        const importe =
            numeroSeguro(monto);

        if (importe <= 0) {

            showToast(
                '⚠️ Monto inválido',
                'error'
            );

            return null;
        }

        if (!transmisionId) {
            return null;
        }

        try {

            /*
             * IMPORTANTE:
             * El frontend NO debe ser considerado autoridad
             * financiera.
             *
             * Estos valores sirven únicamente para registrar
             * la intención/flujo del pago.
             *
             * La confirmación real de crypto debe venir del
             * backend/webhook correspondiente.
             */
            const idempotencyKey =
                generarIdempotencyKey(
                    'pago'
                );

            /*
             * No marcamos como completado automáticamente
             * desde el navegador.
             */
            const {
                data,
                error
            } =
                await this.supabase
                    .from('pagos_transmision')
                    .insert({
                        transmision_id:
                            transmisionId,

                        espectador_id:
                            this.usuario.id,

                        monto_pagado:
                            importe,

                        comision_sariels:
                            0,

                        monto_streamer:
                            0,

                        metodo_pago:
                            metodo ||
                            'pendiente',

                        tipo_pago:
                            'acceso',

                        estado:
                            'pendiente',

                        idempotency_key:
                            idempotencyKey
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            return data;

        } catch (error) {

            console.error(
                'Error registrando pago:',
                error
            );

            showToast(
                '❌ No fue posible registrar el pago',
                'error'
            );

            return null;
        }
    }

    async verificarAcceso(
        transmisionId
    ) {

        if (!this.usuario) {
            return false;
        }

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('pagos_transmision')
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

            return (
                Array.isArray(data) &&
                data.length > 0
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

        if (!this.usuario) {

            showToast(
                '⚠️ Inicia sesión para suscribirte',
                'error'
            );

            return null;
        }

        if (
            !streamerId ||
            streamerId === this.usuario.id
        ) {

            showToast(
                '⚠️ Streamer inválido',
                'error'
            );

            return null;
        }

        const precio =
            numeroSeguro(
                precioMensual
            );

        if (precio <= 0) {

            showToast(
                '⚠️ Precio inválido',
                'error'
            );

            return null;
        }

        try {

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
                            precio,

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
                `✅ Suscripción de $${precio} MXN creada`,
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error suscribiéndose:',
                error
            );

            showToast(
                '❌ No fue posible crear la suscripción',
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

        if (!this.usuario) {

            showToast(
                '⚠️ Inicia sesión para promocionar',
                'error'
            );

            return null;
        }

        const nivelNumero =
            Number(nivel);

        const horasNumero =
            Number(horas);

        if (
            ![1, 2, 3].includes(
                nivelNumero
            )
        ) {

            showToast(
                '⚠️ Nivel inválido',
                'error'
            );

            return null;
        }

        if (
            !Number.isFinite(
                horasNumero
            ) ||
            horasNumero <= 0
        ) {

            showToast(
                '⚠️ Duración inválida',
                'error'
            );

            return null;
        }

        /*
         * Estos precios son configuración de UI.
         * Para producción financiera la autoridad debe estar
         * en backend/RPC y no en el navegador.
         */
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
            precios[nivelNumero] *
            horasNumero;

        try {

            const {
                data,
                error
            } =
                await this.supabase
                    .from('promociones_streamer')
                    .insert({
                        streamer_id:
                            this.usuario.id,

                        transmision_id:
                            transmisionId,

                        nivel_promocion:
                            nivelNumero,

                        costo_promocion:
                            costo,

                        duracion_promocion:
                            horasNumero,

                        posicion_prioridad:
                            prioridades[
                                nivelNumero
                            ],

                        activo:
                            true
                    })
                    .select()
                    .single();

            if (error) {
                throw error;
            }

            showToast(
                `🚀 Promoción nivel ${nivelNumero} registrada`,
                'success'
            );

            return data;

        } catch (error) {

            console.error(
                'Error activando promoción:',
                error
            );

            showToast(
                '❌ No fue posible activar la promoción',
                'error'
            );

            return null;
        }
    }

    /* ============================================================
       FINALIZAR TRANSMISIÓN
       ============================================================ */

    async finalizarTransmision(
        transmisionId
    ) {

        if (!this.usuario) {
            return false;
        }

        try {

            const {
                error
            } =
                await this.supabase
                    .from('transmisiones')
                    .update({
                        estado:
                            'finalizada',

                        is_live:
                            false,

                        fecha_fin:
                            new Date().toISOString()
                    })
                    .eq(
                        'id',
                        transmisionId
                    )
                    .eq(
                        'streamer_id',
                        this.usuario.id
                    );

            if (error) {
                throw error;
            }

            showToast(
                '⏹️ Transmisión finalizada',
                'success'
            );

            return true;

        } catch (error) {

            console.error(
                'Error finalizando transmisión:',
                error
            );

            showToast(
                '❌ No fue posible finalizar la transmisión',
                'error'
            );

            return false;
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

        if (
            !loginBtn &&
            !userInfo
        ) {
            return;
        }

        try {

            if (user) {

                if (loginBtn) {
                    loginBtn.style.display =
                        'none';
                }

                if (userInfo) {

                    userInfo.style.display =
                        'flex';

                    const nombre =
                        escapeHTML(
                            user
                                .user_metadata
                                ?.nombre ||
                            'Usuario'
                        );

                    userInfo.innerHTML = `
                        <span style="font-size:0.7rem;color:var(--gold);">
                            ${nombre}
                            <span style="font-size:0.5rem;color:var(--text-muted);">
                                (${escapeHTML(this.tokens)} Es.stoks)
                            </span>
                        </span>

                        <button
                            type="button"
                            onclick="app.cerrarSesion()"
                            style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.6rem;"
                            aria-label="Cerrar sesión"
                        >
                            ✕
                        </button>
                    `;
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

                    const safeWallet =
                        escapeHTML(
                            wallet
                        );

                    walletInfo.innerHTML = `
                        <span style="font-size:0.6rem;color:var(--text-muted);">
                            🟢 ${safeWallet.slice(0, 6)}...${safeWallet.slice(-4)}
                        </span>

                        <button
                            type="button"
                            onclick="app.desconectarWallet()"
                            style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.5rem;"
                            aria-label="Desconectar wallet"
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
       UI TOKENS
       ============================================================ */

    async actualizarUITokens() {

        await this.cargarTokens();

        this.actualizarUIUsuario(
            this.usuario
        );

        const badge =
            document.getElementById(
                'tokenBadgeCantidad'
            );

        if (badge) {
            badge.textContent =
                String(this.tokens);
        }
    }

    /* ============================================================
       DESTROY
       ============================================================ */

    async destroy() {

        try {

            if (
                this.usuario &&
                this.isOnline
            ) {
                await this.actualizarOnline(
                    false
                );
            }

        } catch (error) {

            console.warn(
                'No se pudo actualizar offline:',
                error
            );
        }

        if (
            this._authListener?.data
                ?.subscription
        ) {

            this._authListener
                .data
                .subscription
                .unsubscribe();

        } else if (
            this._authListener
                ?.subscription
        ) {

            this._authListener
                .subscription
                .unsubscribe();
        }

        if (
            this._visibilityHandler
        ) {

            document.removeEventListener(
                'visibilitychange',
                this._visibilityHandler
            );

            this._visibilityHandler =
                null;
        }

        if (
            this._beforeUnloadHandler
        ) {

            window.removeEventListener(
                'beforeunload',
                this._beforeUnloadHandler
            );

            this._beforeUnloadHandler =
                null;
        }

        this._intervalos.forEach(
            intervalo =>
                clearInterval(
                    intervalo
                )
        );

        this._intervalos = [];

        this._initialized =
            false;

        console.log(
            '🧹 App destruida correctamente'
        );
    }
}

/* ================================================================
   INSTANCIA GLOBAL
   ================================================================ */

const app =
    new GalletaDomoApp();

appInstance = app;

window.app = app;
window.appInstance = app;

window.usuarioActual =
    usuarioActual;

window.showToast =
    showToast;

window.escapeHTML =
    escapeHTML;

/*
 * Alias útil para páginas antiguas.
 */
window.supabaseClient =
    supabaseClient;

/* ================================================================
   INICIALIZACIÓN
   ================================================================ */

function iniciarAplicacion() {

    try {

        console.log(
            "◈ Sariel's App - Lista"
        );

        console.log(
            '🌐 API:',
            app.apiUrl
        );

        console.log(
            '◉ Supabase conectado'
        );

        console.log(
            '◆ Wallet:',
            localStorage.getItem(
                'sariels_wallet'
            )
                ? 'Conectada'
                : 'Desconectada'
        );

        app.init();

    } catch (error) {

        console.error(
            '❌ Error en inicialización:',
            error
        );

        showToast(
            '⚠️ Error al inicializar la aplicación',
            'error'
        );
    }
}

if (
    document.readyState ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        iniciarAplicacion,
        {
            once: true
        }
    );

} else {

    iniciarAplicacion();
}

/* ================================================================
   CAMBIO DE CUENTA EN METAMASK
   ================================================================ */

if (
    typeof window.ethereum !==
    'undefined'
) {

    window.ethereum.on(
        'accountsChanged',
        async accounts => {

            try {

                if (
                    !accounts ||
                    accounts.length === 0
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
                    normalizarWallet(
                        accounts[0]
                    );

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

                if (app.usuario) {

                    await app.vincularWallet(
                        wallet
                    );
                }

            } catch (error) {

                console.error(
                    'Error procesando accountsChanged:',
                    error
                );
            }
        }
    );
}