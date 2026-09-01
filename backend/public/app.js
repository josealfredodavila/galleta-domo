/* ================================================================
   APP.JS - VERSIÓN COMPLETA CORREGIDA (SINGLETON + RESOURCE MANAGER)
   RUTA RAILWAY: https://galleta-domo.up.railway.app
   ================================================================ */

// ================================================================
// 1. CONFIGURACIÓN SUPABASE
// ================================================================
const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

// ================================================================
// 2. SINGLETON DE SUPABASE CLIENT - ÚNICO EN TODA LA APP
// ================================================================
if (typeof window._supabaseClient === 'undefined') {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                }
            });
        } else {
            throw new Error('SDK de Supabase no encontrado en window.supabase');
        }
        console.log('✅ Supabase Client singleton inicializado');
    } catch (error) {
        console.error('❌ Error inicializando Supabase Client:', error);
        window._supabaseClient = {
            auth: {
                getSession: async () => ({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                signUp: async () => ({ data: null, error: new Error('Supabase no disponible') }),
                signInWithPassword: async () => ({ data: null, error: new Error('Supabase no disponible') }),
                signOut: async () => ({ error: null }),
                resetPasswordForEmail: async () => ({ error: null }),
                updateUser: async () => ({ error: null })
            },
            from: () => ({
                select: () => ({ 
                    eq: () => ({ single: async () => ({ data: null, error: null }), order: () => ({ data: [], error: null }) }),
                    insert: () => ({ select: async () => ({ data: [], error: null }) }),
                    update: () => ({ eq: async () => ({ error: null }) })
                })
            }),
            rpc: async () => ({ data: null, error: null }),
            channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
            removeChannel: () => {}
        };
    }
}

// Exponer la instancia única a nivel global
window.supabaseClient = window._supabaseClient;
window.supabase = window._supabaseClient;

// ================================================================
// 3. GESTOR GLOBAL DE RECURSOS (PREVENCIÓN DE MEMORY LEAKS)
// ================================================================
class ResourceManager {
    constructor() {
        this.channels = [];
        this.observers = [];
        this.intervals = [];
        this.timeouts = [];
        this.streams = [];
        this._isCleaning = false;
    }

    // ✅ Registra un canal Realtime con límite de 20
    registerChannel(channel, name = 'unnamed_channel') {
        if (!channel) return channel;
        
        this.channels.push({ channel, name, timestamp: Date.now() });
        
        // Límite de seguridad: máximo 20 canales
        if (this.channels.length > 20) {
            const old = this.channels.shift();
            try {
                window.supabaseClient.removeChannel(old.channel);
                console.warn(`🧹 Canal antiguo eliminado: ${old.name}`);
            } catch (e) {
                console.warn(`Error eliminando canal ${old.name}:`, e);
            }
        }
        return channel;
    }

    // ✅ Registra un IntersectionObserver con límite de 30
    registerObserver(observer, name = 'unnamed_observer') {
        if (!observer || typeof observer.disconnect !== 'function') return observer;
        
        this.observers.push({ observer, name, timestamp: Date.now() });
        
        if (this.observers.length > 30) {
            const old = this.observers.shift();
            try {
                old.observer.disconnect();
                console.warn(`🧹 Observer antiguo desconectado: ${old.name}`);
            } catch (e) {}
        }
        return observer;
    }

    // ✅ Registra un setInterval con límite de 15
    registerInterval(interval, name = 'unnamed_interval') {
        if (!interval) return interval;
        
        this.intervals.push({ interval, name, timestamp: Date.now() });
        
        if (this.intervals.length > 15) {
            const old = this.intervals.shift();
            clearInterval(old.interval);
            console.warn(`🧹 Interval antiguo limpiado: ${old.name}`);
        }
        return interval;
    }

    // ✅ Registra un setTimeout con límite de 30
    registerTimeout(timeout, name = 'unnamed_timeout') {
        if (!timeout) return timeout;
        
        this.timeouts.push({ timeout, name, timestamp: Date.now() });
        
        if (this.timeouts.length > 30) {
            const old = this.timeouts.shift();
            clearTimeout(old.timeout);
        }
        return timeout;
    }

    // ✅ Registra un MediaStream con límite de 10
    registerStream(stream, name = 'unnamed_stream') {
        if (!stream || typeof stream.getTracks !== 'function') return stream;
        
        this.streams.push({ stream, name, timestamp: Date.now() });
        
        if (this.streams.length > 10) {
            const old = this.streams.shift();
            try {
                old.stream.getTracks().forEach(t => t.stop());
                console.warn(`🧹 Stream antiguo detenido: ${old.name}`);
            } catch (e) {}
        }
        return stream;
    }

    // ✅ Limpieza completa de todos los recursos
    cleanup() {
        if (this._isCleaning) return;
        this._isCleaning = true;
        
        console.log('🧹 Limpiando todos los recursos...');

        // Limpiar canales
        const channelsCopy = [...this.channels];
        this.channels = [];
        channelsCopy.forEach(({ channel, name }) => {
            try {
                window.supabaseClient.removeChannel(channel);
                console.log(`🧹 Canal cerrado: ${name}`);
            } catch (e) {
                console.warn(`Error cerrando canal ${name}:`, e);
            }
        });

        // Limpiar observers
        const observersCopy = [...this.observers];
        this.observers = [];
        observersCopy.forEach(({ observer, name }) => {
            try {
                observer.disconnect();
                console.log(`🧹 Observer desconectado: ${name}`);
            } catch (e) {
                console.warn(`Error desconectando observer ${name}:`, e);
            }
        });

        // Limpiar intervals
        const intervalsCopy = [...this.intervals];
        this.intervals = [];
        intervalsCopy.forEach(({ interval, name }) => {
            try {
                clearInterval(interval);
                console.log(`🧹 Interval limpiado: ${name}`);
            } catch (e) {}
        });

        // Limpiar timeouts
        const timeoutsCopy = [...this.timeouts];
        this.timeouts = [];
        timeoutsCopy.forEach(({ timeout }) => {
            try { clearTimeout(timeout); } catch (e) {}
        });

        // Limpiar streams
        const streamsCopy = [...this.streams];
        this.streams = [];
        streamsCopy.forEach(({ stream, name }) => {
            try {
                stream.getTracks().forEach(t => t.stop());
                console.log(`🧹 Stream detenido: ${name}`);
            } catch (e) {}
        });

        this._isCleaning = false;
        console.log('✅ Limpieza de recursos completada');
    }

    // ✅ Limpieza por nombre específico
    cleanupByName(name) {
        if (!name) return;
        
        this.channels = this.channels.filter(({ channel, name: n }) => {
            if (n === name) {
                try { window.supabaseClient.removeChannel(channel); } catch (e) {}
                return false;
            }
            return true;
        });

        this.observers = this.observers.filter(({ observer, name: n }) => {
            if (n === name) {
                try { observer.disconnect(); } catch (e) {}
                return false;
            }
            return true;
        });

        this.intervals = this.intervals.filter(({ interval, name: n }) => {
            if (n === name) {
                try { clearInterval(interval); } catch (e) {}
                return false;
            }
            return true;
        });

        this.timeouts = this.timeouts.filter(({ timeout, name: n }) => {
            if (n === name) {
                try { clearTimeout(timeout); } catch (e) {}
                return false;
            }
            return true;
        });

        this.streams = this.streams.filter(({ stream, name: n }) => {
            if (n === name) {
                try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
                return false;
            }
            return true;
        });
    }
}

// ================================================================
// 4. EXPONER FUNCIONES DE RESOURCE MANAGER GLOBALMENTE
// ================================================================
window._resourceManager = new ResourceManager();

// Funciones de ayuda para registrar recursos
window.registerSupabaseChannel = (channel, name) => window._resourceManager.registerChannel(channel, name);
window.registerObserver = (observer, name) => window._resourceManager.registerObserver(observer, name);
window.registerInterval = (interval, name) => window._resourceManager.registerInterval(interval, name);
window.registerTimeout = (timeout, name) => window._resourceManager.registerTimeout(timeout, name);
window.registerStream = (stream, name) => window._resourceManager.registerStream(stream, name);
window.cleanupResources = () => window._resourceManager.cleanup();
window.cleanupResourcesByName = (name) => window._resourceManager.cleanupByName(name);

// ================================================================
// 5. ESCUCHADORES GLOBALES DE LIMPIEZA
// ================================================================
window.addEventListener('beforeunload', () => {
    if (window._resourceManager) {
        window._resourceManager.cleanup();
    }
});

window.addEventListener('pagehide', () => {
    if (window._resourceManager) {
        window._resourceManager.cleanup();
    }
});

// ================================================================
// 6. SHOWTOAST - VERSIÓN GLOBAL ÚNICA
// ================================================================
function showToast(msg, type = '') {
    let t = document.getElementById('toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.className = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show';
    if (type === 'error') t.classList.add('error');
    else if (type === 'warning') t.classList.add('warning');
    else if (type === 'success') t.classList.add('success');
    else t.classList.remove('error', 'warning', 'success');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}
window.showToast = showToast;

// ================================================================
// 7. GETSESSION - VERSIÓN GLOBAL ÚNICA
// ================================================================
async function getSession() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        return session;
    } catch (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }
}
window.getSession = getSession;

// ================================================================
// 8. ESCAPEHTML - VERSIÓN GLOBAL ÚNICA
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}
window.escapeHTML = escapeHTML;

// ================================================================
// 9. VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let walletConectada = false;
let web3 = null;

// ================================================================
// 10. CLASE PRINCIPAL GALETTADOMOAPP
// ================================================================
class GalletaDomoApp {
    constructor() {
        this.supabase = window.supabaseClient;
        this.apiUrl = window.location.origin + '/api';
        this.usuario = null;
        this.wallet = null;
        this.tokens = 0;
        this.isOnline = false;
        this._cleanupFunctions = [];
    }

    // ✅ Registrar función de limpieza
    registerCleanup(fn, name = 'cleanup') {
        if (typeof fn === 'function') {
            this._cleanupFunctions.push({ fn, name });
            if (this._cleanupFunctions.length > 20) {
                const old = this._cleanupFunctions.shift();
                try { old.fn(); } catch (e) {}
            }
        }
    }

    async init() {
        console.log('◈ Sariel\'s - App inicializada');
        console.log('🌐 API:', this.apiUrl);

        // Verificar sesión existente
        try {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session) {
                this.usuario = session.user;
                usuarioActual = session.user;
                window.usuarioActual = session.user;
                await this.cargarTokens();
                await this.actualizarOnline(true);
                this.actualizarUIUsuario(session.user);
            }
        } catch (err) {
            console.error('Error al obtener la sesión inicial:', err);
        }

        // Escuchar cambios de autenticación
        const authSubscription = this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.usuario = session.user;
                usuarioActual = session.user;
                window.usuarioActual = session.user;
                await this.cargarTokens();
                await this.actualizarOnline(true);
                this.actualizarUIUsuario(session.user);
                showToast('✅ ¡Bienvenido ' + (session.user.user_metadata?.nombre || 'Usuario') + '!');
            }
            if (event === 'SIGNED_OUT') {
                await this.actualizarOnline(false);
                this.usuario = null;
                usuarioActual = null;
                window.usuarioActual = null;
                this.tokens = 0;
                this.actualizarUIUsuario(null);
                showToast('🔌 Sesión cerrada');
            }
            if (event === 'TOKEN_REFRESHED') {
                console.log('🔄 Token refrescado automáticamente');
            }
        });

        // Registrar limpieza de suscripción auth
        this.registerCleanup(() => {
            try { authSubscription.data?.subscription?.unsubscribe(); } catch (e) {}
        }, 'auth_subscription');

        // Conectar wallet si hay guardada
        const walletGuardada = localStorage.getItem('sariels_wallet');
        if (walletGuardada) {
            this.wallet = walletGuardada;
            this.actualizarUIWallet(walletGuardada);
        }

        // Detectar visibilidad de página para actualizar estado
        const visibilityHandler = () => {
            if (document.visibilityState === 'visible' && this.usuario) {
                this.actualizarOnline(true);
            } else if (document.visibilityState === 'hidden' && this.usuario) {
                this.actualizarOnline(false);
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        this.registerCleanup(() => {
            document.removeEventListener('visibilitychange', visibilityHandler);
        }, 'visibility_handler');
    }

    // ================================================================
    // 🪙 SISTEMA DE TOKENS
    // ================================================================

    async cargarTokens() {
        try {
            if (!this.usuario) return 0;
            const { data, error } = await this.supabase
                .from('usuarios')
                .select('tokens')
                .eq('id', this.usuario.id)
                .single();

            if (error) throw error;
            this.tokens = data?.tokens || 0;
            return this.tokens;
        } catch (error) {
            console.error('Error cargando tokens:', error);
            return 0;
        }
    }

    async obtenerTokens() {
        if (!this.usuario) return 0;
        await this.cargarTokens();
        return this.tokens;
    }

    async transferirTokens(destinoId, cantidad) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para transferir', 'error');
                return false;
            }

            if (this.tokens < cantidad) {
                showToast('⚠️ No tienes suficientes tokens', 'error');
                return false;
            }

            if (cantidad <= 0) {
                showToast('⚠️ Cantidad inválida', 'error');
                return false;
            }

            const { error: errorEmisor } = await this.supabase.rpc('decrement_tokens', {
                p_user_id: this.usuario.id,
                p_cantidad: cantidad
            });

            if (errorEmisor) throw errorEmisor;

            const { error: errorReceptor } = await this.supabase.rpc('increment_tokens', {
                p_user_id: destinoId,
                p_cantidad: cantidad
            });

            if (errorReceptor) throw errorReceptor;

            this.tokens -= cantidad;
            showToast(`✅ ${cantidad} Es.stoks transferidos`, 'success');
            return true;

        } catch (error) {
            console.error('Error transfiriendo tokens:', error);
            showToast('❌ Error al transferir tokens', 'error');
            return false;
        }
    }

    // ================================================================
    // 🟢 ESTADO ONLINE
    // ================================================================

    async actualizarOnline(online) {
        try {
            if (!this.usuario) return;

            const { error } = await this.supabase.rpc('actualizar_online', {
                p_online: online
            });

            if (error) throw error;
            
            this.isOnline = online;
            
            const estadoEl = document.getElementById('estadoOnline');
            if (estadoEl) {
                estadoEl.textContent = online ? '🟢 En línea' : '⚪ Desconectado';
                estadoEl.style.color = online ? 'var(--success)' : 'var(--text-muted)';
            }

        } catch (error) {
            console.error('Error actualizando estado online:', error);
        }
    }

    async obtenerEstadoOnline(usuarioId) {
        try {
            const { data, error } = await this.supabase
                .from('usuarios')
                .select('online, ultima_conexion')
                .eq('id', usuarioId)
                .single();

            if (error) throw error;
            return data;

        } catch (error) {
            console.error('Error obteniendo estado online:', error);
            return null;
        }
    }

    // ================================================================
    // 📊 ESTADÍSTICAS DE USUARIO
    // ================================================================

    async obtenerEstadisticas() {
        try {
            if (!this.usuario) return null;

            const { data, error } = await this.supabase
                .from('estadisticas_usuarios')
                .select('*')
                .eq('user_id', this.usuario.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data || null;

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    async actualizarEstadisticas() {
        try {
            if (!this.usuario) return;

            const stats = await this.obtenerEstadisticas();
            
            if (stats) {
                await this.supabase
                    .from('estadisticas_usuarios')
                    .update({
                        tokens_actuales: this.tokens,
                        ultima_actividad: new Date().toISOString()
                    })
                    .eq('user_id', this.usuario.id);
            } else {
                await this.supabase
                    .from('estadisticas_usuarios')
                    .insert({
                        user_id: this.usuario.id,
                        tokens_actuales: this.tokens,
                        ultima_actividad: new Date().toISOString()
                    });
            }

        } catch (error) {
            console.error('Error actualizando estadísticas:', error);
        }
    }

    // ================================================================
    // 🔐 AUTENTICACIÓN CON EMAIL
    // ================================================================

    async registrarUsuario(email, password, nombre) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        nombre: nombre || 'Explorador',
                        role: 'user'
                    }
                }
            });

            if (error) throw error;
            showToast('✅ Cuenta creada. Verifica tu correo.');
            return data;
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
            throw error;
        }
    }

    async iniciarSesion(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;
            showToast('✅ Sesión iniciada correctamente');
            return data;
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
            throw error;
        }
    }

    async cerrarSesion() {
        if (!confirm('¿Seguro que quieres cerrar sesión?')) return;

        try {
            await this.actualizarOnline(false);
            await this.supabase.auth.signOut();
            localStorage.removeItem('sariels_wallet');
            this.wallet = null;
            this.usuario = null;
            usuarioActual = null;
            window.usuarioActual = null;
            this.tokens = 0;
            showToast('🔌 Sesión cerrada');
        } catch (error) {
            showToast('❌ Error al cerrar sesión', 'error');
        }
    }

    // ================================================================
    // 🔐 RECUPERAR CONTRASEÑA
    // ================================================================

    async recuperarContraseña(email) {
        try {
            const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/actualizar-contraseña.html'
            });

            if (error) throw error;
            
            showToast('📧 ¡Listo! Te enviamos un enlace a tu correo. Revisa tu bandeja.');
            return true;
        } catch (error) {
            showToast('❌ No encontramos ese correo. Verifica que esté bien escrito.', 'error');
            return false;
        }
    }

    async actualizarContraseña(nuevaContraseña) {
        try {
            const { data, error } = await this.supabase.auth.updateUser({
                password: nuevaContraseña
            });

            if (error) throw error;
            
            showToast('✅ ¡Contraseña actualizada! Ahora inicia sesión con la nueva.');
            return true;
        } catch (error) {
            showToast('❌ Error al actualizar. Intenta de nuevo.', 'error');
            return false;
        }
    }

    // ================================================================
    // 🔐 RECUPERAR CON WALLET (WEB3)
    // ================================================================

    async recuperarConWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                showToast('⚠️ Conecta MetaMask primero', 'error');
                return;
            }

            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            if (!accounts || accounts.length === 0) return;

            const wallet = accounts[0];
            
            const { data, error } = await this.supabase
                .from('usuarios')
                .select('email')
                .eq('wallet', wallet)
                .single();

            if (error || !data) {
                showToast('⚠️ No hay cuenta asociada a esta wallet', 'error');
                return;
            }

            await this.recuperarContraseña(data.email);
            
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
        }
    }

    // ================================================================
    // 💳 WALLET (MetaMask)
    // ================================================================

    async conectarWallet() {
        if (typeof window.ethereum === 'undefined') {
            showToast('⚠️ Instala MetaMask para continuar', 'warning');
            if (confirm('¿Quieres ir a descargar MetaMask?')) {
                window.open('https://metamask.io/download/', '_blank');
            }
            return;
        }

        try {
            web3 = new Web3(window.ethereum);
            
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== '0x89') {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x89' }]
                    });
                } catch (e) {
                    showToast('⚠️ Cambia a Polygon Mainnet', 'warning');
                }
            }

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts && accounts.length > 0) {
                this.wallet = accounts[0];
                localStorage.setItem('sariels_wallet', accounts[0]);
                this.actualizarUIWallet(accounts[0]);
                showToast('✅ Wallet conectada: ' + accounts[0].slice(0, 6) + '...' + accounts[0].slice(-4));
                
                if (this.usuario) {
                    await this.vincularWallet(accounts[0]);
                }
            }
        } catch (error) {
            showToast('❌ Error al conectar wallet: ' + error.message, 'error');
        }
    }

    async vincularWallet(walletAddress) {
        try {
            const { error } = await this.supabase
                .from('usuarios')
                .update({ wallet: walletAddress })
                .eq('id', this.usuario.id);

            if (error) throw error;
        } catch (error) {
            console.error('Error vinculando wallet:', error);
        }
    }

    async desconectarWallet() {
        if (!confirm('¿Seguro que quieres desconectar tu wallet?')) return;
        
        localStorage.removeItem('sariels_wallet');
        this.wallet = null;
        this.actualizarUIWallet(null);
        showToast('🔌 Wallet desconectada');
    }

    // ================================================================
    // 🎬 TRANSMISIONES
    // ================================================================

    async crearTransmision(datos) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión primero', 'error');
                return null;
            }

            const { data, error } = await this.supabase
                .from('transmisiones')
                .insert({
                    streamer_id: this.usuario.id,
                    titulo: datos.titulo,
                    descripcion: datos.descripcion || '',
                    tags: datos.tags || [],
                    tipo_transmision: datos.tipo || 'pago',
                    precio: datos.precio || 0,
                    precio_suscripcion: datos.precioSuscripcion || 0,
                    fecha_inicio: new Date().toISOString(),
                    estado: 'en_vivo'
                })
                .select();

            if (error) throw error;
            showToast('◉ Transmisión iniciada: ' + datos.titulo);
            return data[0];
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
            return null;
        }
    }

    async obtenerTransmisionesActivas() {
        try {
            const { data, error } = await this.supabase
                .from('transmisiones')
                .select('*, usuarios(nombre, avatar)')
                .eq('estado', 'en_vivo')
                .order('fecha_inicio', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo transmisiones:', error);
            return [];
        }
    }

    async obtenerTransmisionesProgramadas() {
        try {
            const { data, error } = await this.supabase
                .from('transmisiones')
                .select('*, usuarios(nombre, avatar)')
                .eq('estado', 'programada')
                .order('fecha_inicio', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo transmisiones programadas:', error);
            return [];
        }
    }

    // ================================================================
    // 💬 CHAT
    // ================================================================

    async enviarMensaje(transmisionId, mensaje) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para chatear', 'error');
                return null;
            }

            const { data, error } = await this.supabase
                .from('mensajes_live')
                .insert({
                    transmision_id: transmisionId,
                    usuario_id: this.usuario.id,
                    mensaje: mensaje,
                    nombre_usuario: this.usuario.user_metadata?.nombre || 'Anónimo'
                })
                .select();

            if (error) throw error;
            return data[0];
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            return null;
        }
    }

    async obtenerMensajes(transmisionId) {
        try {
            const { data, error } = await this.supabase
                .from('mensajes_live')
                .select('*')
                .eq('transmision_id', transmisionId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error obteniendo mensajes:', error);
            return [];
        }
    }

    suscribirseChat(transmisionId, callback) {
        const channelName = `chat-${transmisionId}`;
        window._resourceManager.cleanupByName(channelName);

        const channel = this.supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes_live',
                filter: `transmision_id=eq.${transmisionId}`
            }, (payload) => {
                if (callback) callback(payload.new);
            })
            .subscribe();

        return window.registerSupabaseChannel(channel, channelName);
    }

    // ================================================================
    // 💰 PAGOS
    // ================================================================

    async registrarPago(transmisionId, monto, metodo) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para pagar', 'error');
                return null;
            }

            const comision = monto * 0.5;
            const montoStreamer = monto * 0.5;

            const { data, error } = await this.supabase
                .from('pagos_transmision')
                .insert({
                    transmision_id: transmisionId,
                    espectador_id: this.usuario.id,
                    monto_pagado: monto,
                    comision_sariels: comision,
                    monto_streamer: montoStreamer,
                    metodo_pago: metodo,
                    tipo_pago: 'acceso',
                    estado: 'completado'
                })
                .select();

            if (error) throw error;
            showToast(`✅ Pago de $${monto} MXN completado`);
            return data[0];
        } catch (error) {
            showToast('❌ Error en pago: ' + error.message, 'error');
            return null;
        }
    }

    async verificarAcceso(transmisionId) {
        try {
            if (!this.usuario) return false;

            const { data, error } = await this.supabase
                .from('pagos_transmision')
                .select('*')
                .eq('transmision_id', transmisionId)
                .eq('espectador_id', this.usuario.id)
                .eq('estado', 'completado');

            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('Error verificando acceso:', error);
            return false;
        }
    }

    // ================================================================
    // 📝 SUSCRIPCIONES
    // ================================================================

    async suscribirse(streamerId, precioMensual) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para suscribirte', 'error');
                return null;
            }

            const { data, error } = await this.supabase
                .from('suscripciones')
                .insert({
                    streamer_id: streamerId,
                    espectador_id: this.usuario.id,
                    precio_mensual: precioMensual,
                    activo: true,
                    proximo_pago: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                })
                .select();

            if (error) throw error;
            showToast(`✅ Suscripción mensual de $${precioMensual} MXN activada`);
            return data[0];
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
            return null;
        }
    }

    // ================================================================
    // 🚀 PROMOCIONES
    // ================================================================

    async activarPromocion(transmisionId, nivel, horas) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para promocionar', 'error');
                return null;
            }

            const precios = { 1: 50, 2: 150, 3: 300 };
            const prioridades = { 1: 3, 2: 2, 3: 1 };
            const costo = precios[nivel] * horas;

            const { data, error } = await this.supabase
                .from('promociones_streamer')
                .insert({
                    streamer_id: this.usuario.id,
                    transmision_id: transmisionId,
                    nivel_promocion: nivel,
                    costo_promocion: costo,
                    duracion_promocion: horas,
                    posicion_prioridad: prioridades[nivel],
                    activo: true
                })
                .select();

            if (error) throw error;

            await this.supabase
                .from('transmisiones')
                .update({
                    promocion_activa: true,
                    nivel_promocion: nivel,
                    costo_promocion: costo
                })
                .eq('id', transmisionId);

            showToast(`🚀 Promoción nivel ${nivel} activada por $${costo} MXN`);
            return data[0];
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
            return null;
        }
    }

    // ================================================================
    // 🎨 UI UPDATES
    // ================================================================

    actualizarUIUsuario(user) {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');

        if (!loginBtn && !userInfo) return;

        if (user) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (userInfo) {
                userInfo.style.display = 'flex';
                userInfo.innerHTML = `
                    <span style="font-size:0.7rem;color:var(--gold);">
                        ${window.escapeHTML(user.user_metadata?.nombre || 'Usuario')} 
                        <span style="font-size:0.5rem;color:var(--text-muted);">
                            (${this.tokens} Es.stoks)
                        </span>
                    </span>
                    <button onclick="app.cerrarSesion()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.6rem;">
                        ✕
                    </button>
                `;
            }
        } else {
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (userInfo) {
                userInfo.style.display = 'none';
                userInfo.innerHTML = '';
            }
        }
    }

    actualizarUIWallet(wallet) {
        const walletBtn = document.getElementById('walletBtn');
        const walletInfo = document.getElementById('walletInfo');

        if (!walletBtn && !walletInfo) return;

        if (wallet) {
            if (walletBtn) walletBtn.style.display = 'none';
            if (walletInfo) {
                walletInfo.style.display = 'flex';
                walletInfo.innerHTML = `
                    <span style="font-size:0.6rem;color:var(--text-muted);">
                        🟢 ${wallet.slice(0, 6)}...${wallet.slice(-4)}
                    </span>
                    <button onclick="app.desconectarWallet()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.5rem;">
                        ✕
                    </button>
                `;
            }
        } else {
            if (walletBtn) walletBtn.style.display = 'inline-flex';
            if (walletInfo) {
                walletInfo.style.display = 'none';
                walletInfo.innerHTML = '';
            }
        }
    }

    async actualizarUITokens() {
        await this.cargarTokens();
        this.actualizarUIUsuario(this.usuario);
        
        const tokenBadge = document.getElementById('tokenBadgeCantidad');
        if (tokenBadge) {
            tokenBadge.textContent = this.tokens;
        }
    }
}

// ================================================================
// 11. INSTANCIAR APP
// ================================================================
const app = new GalletaDomoApp();

window.app = app;
window.usuarioActual = usuarioActual;

// ================================================================
// 12. INICIALIZACIÓN - UNA SOLA VEZ
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('◈ Sariel\'s App - Lista');
    console.log('🌐 API:', app.apiUrl);
    console.log('◉ Supabase conectado');
    console.log('◆ Wallet: ' + (localStorage.getItem('sariels_wallet') ? 'Conectada' : 'Desconectada'));
    
    app.init();
    
    if (app.usuario) {
        app.actualizarUIUsuario(app.usuario);
    }
    
    const walletGuardada = localStorage.getItem('sariels_wallet');
    if (walletGuardada) {
        app.actualizarUIWallet(walletGuardada);
    }
});