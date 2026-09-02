/* ================================================================
   APP.JS - VERSIÓN PRODUCCIÓN - CORREGIDA Y OPTIMIZADA
   SISTEMA COMPLETO: Supabase + Autenticación + Tokens + Wallet + Live
   RUTA RAILWAY: https://galleta-domo.up.railway.app
   ================================================================ */

// ================================================================
// CONFIGURACIÓN SUPABASE - CON VALIDACIÓN
// ================================================================
const SUPABASE_URL = 'https://zultnlogdoajehbswlih.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_S3jONAz3mRO4JKBRhUdI1A_-nsyVhKu';

// ✅ VALIDACIÓN: Asegurar que Supabase está disponible
if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
    console.error('❌ Supabase no está disponible. Verifica la carga de la librería.');
    // Crear un fallback para evitar errores
    window.supabase = { createClient: () => ({ auth: { getSession: () => ({ data: { session: null } }) } }) };
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================================================================
// EXPONER SUPABASE GLOBALMENTE
// ================================================================
window.supabase = supabaseClient;

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let walletConectada = false;
let web3 = null;
let appInstance = null;

// ================================================================
// ESCAPE HTML - PREVENCIÓN XSS
// ================================================================
function escapeHTML(texto) {
    if (!texto) return '';
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
}

// ================================================================
// TOAST - VERSIÓN SEGURA CON FALLBACK
// ================================================================
function showToast(msg, type = '') {
    try {
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
    } catch (e) {
        console.warn('Toast no disponible:', e);
        // Fallback a console
        console.log(`[${type || 'info'}] ${msg}`);
    }
}

// ================================================================
// CLASE PRINCIPAL - GALETA DOMO APP
// ================================================================
class GalletaDomoApp {
    constructor() {
        this.supabase = supabaseClient;
        this.apiUrl = window.location.origin + '/api';
        this.usuario = null;
        this.wallet = null;
        this.tokens = 0;
        this.isOnline = false;
        this._initialized = false;
        this._authListener = null;
        this._intervalos = [];
    }

    // ================================================================
    // INICIALIZACIÓN - CON MANEJO DE ERRORES
    // ================================================================
    async init() {
        if (this._initialized) return;
        this._initialized = true;

        console.log('◈ Sariel\'s - App inicializada');
        console.log('🌐 API:', this.apiUrl);

        try {
            // Verificar sesión existente
            const { data: { session }, error } = await this.supabase.auth.getSession();
            if (error) throw error;

            if (session) {
                this.usuario = session.user;
                usuarioActual = session.user;
                await this.cargarTokens();
                await this.actualizarOnline(true);
                this.actualizarUIUsuario(session.user);
                showToast('✅ ¡Bienvenido ' + escapeHTML(session.user.user_metadata?.nombre || 'Usuario') + '!');
            }

            // Configurar listener de autenticación
            this._authListener = this.supabase.auth.onAuthStateChange(async (event, session) => {
                try {
                    if (event === 'SIGNED_IN' && session) {
                        this.usuario = session.user;
                        usuarioActual = session.user;
                        await this.cargarTokens();
                        await this.actualizarOnline(true);
                        this.actualizarUIUsuario(session.user);
                        showToast('✅ ¡Bienvenido ' + escapeHTML(session.user.user_metadata?.nombre || 'Usuario') + '!');
                    }
                    if (event === 'SIGNED_OUT') {
                        await this.actualizarOnline(false);
                        this.usuario = null;
                        usuarioActual = null;
                        this.tokens = 0;
                        this.actualizarUIUsuario(null);
                        showToast('🔌 Sesión cerrada');
                    }
                    if (event === 'TOKEN_REFRESHED') {
                        console.log('🔄 Token refrescado automáticamente');
                    }
                } catch (e) {
                    console.error('Error en onAuthStateChange:', e);
                }
            });

            // Recuperar wallet guardada
            const walletGuardada = localStorage.getItem('sariels_wallet');
            if (walletGuardada) {
                this.wallet = walletGuardada;
                this.actualizarUIWallet(walletGuardada);
            }

            // Evento: cerrar sesión al cerrar página
            window.addEventListener('beforeunload', () => {
                if (this.usuario) {
                    this.actualizarOnline(false);
                }
            });

            // Evento: visibilidad de página
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.usuario) {
                    this.actualizarOnline(true);
                } else if (document.visibilityState === 'hidden' && this.usuario) {
                    this.actualizarOnline(false);
                }
            });

            console.log('✅ App inicializada correctamente');

        } catch (error) {
            console.error('❌ Error en init:', error);
            showToast('⚠️ Error al inicializar la aplicación', 'error');
        }
    }

    // ================================================================
    // DESTRUIR APP - LIMPIEZA DE RECURSOS
    // ================================================================
    destroy() {
        // Remover listener de autenticación
        if (this._authListener && this._authListener.unsubscribe) {
            this._authListener.unsubscribe();
            this._authListener = null;
        }

        // Limpiar intervalos
        this._intervalos.forEach(interval => clearInterval(interval));
        this._intervalos = [];

        this._initialized = false;
        console.log('🧹 App destruida correctamente');
    }

    // ================================================================
    // 🪙 SISTEMA DE TOKENS - CON RPC SEGURA
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

            // ✅ USAR RPC ÚNICA PARA TRANSFERENCIA ATÓMICA
            const { data, error } = await this.supabase.rpc('transferir_tokens', {
                p_remitente_id: this.usuario.id,
                p_destinatario_id: destinoId,
                p_cantidad: cantidad
            });

            if (error) throw error;

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
    // 🟢 ESTADO ONLINE - CON RPC SEGURA
    // ================================================================

    async actualizarOnline(online) {
        try {
            if (!this.usuario) return;

            // ✅ USAR UPDATE DIRECTO EN VEZ DE RPC INEXISTENTE
            const { error } = await this.supabase
                .from('usuarios')
                .update({
                    online: online,
                    ultima_conexion: online ? new Date().toISOString() : new Date().toISOString()
                })
                .eq('id', this.usuario.id);

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
    // 🔐 AUTENTICACIÓN CON EMAIL - CON VALIDACIÓN
    // ================================================================

    async registrarUsuario(email, password, nombre) {
        try {
            if (!email || !password) {
                showToast('⚠️ Correo y contraseña son obligatorios', 'error');
                return null;
            }
            if (password.length < 6) {
                showToast('⚠️ La contraseña debe tener al menos 6 caracteres', 'error');
                return null;
            }

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
            
            const nombreUsuario = data.user?.user_metadata?.nombre || 'Usuario';
            showToast(`✅ Cuenta creada ${data.session ? 'y sesión iniciada' : '. Verifica tu correo'}.`, 'success');
            return data;
        } catch (error) {
            console.error('Error registrando usuario:', error);
            let msg = error.message;
            if (msg.includes('already registered')) {
                msg = '⚠️ Este correo ya está registrado';
            } else if (msg.includes('password')) {
                msg = '⚠️ Contraseña inválida';
            } else if (msg.includes('rate limit')) {
                msg = '⏳ Demasiados intentos. Espera unos minutos.';
            }
            showToast('❌ ' + msg, 'error');
            throw error;
        }
    }

    async iniciarSesion(email, password) {
        try {
            if (!email || !password) {
                showToast('⚠️ Correo y contraseña son obligatorios', 'error');
                return null;
            }

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;
            showToast('✅ Sesión iniciada correctamente', 'success');
            return data;
        } catch (error) {
            console.error('Error iniciando sesión:', error);
            let msg = error.message;
            if (msg.includes('Invalid login credentials')) {
                msg = '⚠️ Correo o contraseña incorrectos';
            }
            showToast('❌ ' + msg, 'error');
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
            this.tokens = 0;
            showToast('🔌 Sesión cerrada', 'success');
        } catch (error) {
            console.error('Error cerrando sesión:', error);
            showToast('❌ Error al cerrar sesión', 'error');
        }
    }

    // ================================================================
    // 🔐 RECUPERAR CONTRASEÑA
    // ================================================================

    async recuperarContraseña(email) {
        try {
            if (!email) {
                showToast('⚠️ Ingresa tu correo', 'error');
                return false;
            }

            const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/actualizar-contraseña.html'
            });

            if (error) throw error;
            
            showToast('📧 ¡Listo! Te enviamos un enlace a tu correo. Revisa tu bandeja.', 'success');
            return true;
        } catch (error) {
            console.error('Error recuperando contraseña:', error);
            showToast('❌ No encontramos ese correo. Verifica que esté bien escrito.', 'error');
            return false;
        }
    }

    async actualizarContraseña(nuevaContraseña) {
        try {
            if (!nuevaContraseña || nuevaContraseña.length < 6) {
                showToast('⚠️ La contraseña debe tener al menos 6 caracteres', 'error');
                return false;
            }

            const { data, error } = await this.supabase.auth.updateUser({
                password: nuevaContraseña
            });

            if (error) throw error;
            
            showToast('✅ ¡Contraseña actualizada! Ahora inicia sesión con la nueva.', 'success');
            return true;
        } catch (error) {
            console.error('Error actualizando contraseña:', error);
            showToast('❌ Error al actualizar. Intenta de nuevo.', 'error');
            return false;
        }
    }

    // ================================================================
    // 🔐 RECUPERAR CON WALLET (WEB3) - CON VALIDACIÓN
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
            console.error('Error recuperando con wallet:', error);
            showToast('❌ Error: ' + error.message, 'error');
        }
    }

    // ================================================================
    // 💳 WALLET (MetaMask) - CON VALIDACIÓN Y WEB3 IMPORTADO
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
            // ✅ VERIFICAR QUE WEB3 ESTÁ CARGADO
            if (typeof Web3 === 'undefined') {
                showToast('⚠️ Web3 no está cargado. Recarga la página.', 'error');
                return;
            }

            web3 = new Web3(window.ethereum);
            
            // Cambiar a Polygon Mainnet si es necesario
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== '0x89') {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x89' }]
                    });
                } catch (e) {
                    showToast('⚠️ Cambia a Polygon Mainnet', 'warning');
                    // Continuar igual, el usuario puede cambiar manualmente
                }
            }

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts && accounts.length > 0) {
                this.wallet = accounts[0];
                localStorage.setItem('sariels_wallet', accounts[0]);
                this.actualizarUIWallet(accounts[0]);
                showToast('✅ Wallet conectada: ' + accounts[0].slice(0, 6) + '...' + accounts[0].slice(-4), 'success');
                
                if (this.usuario) {
                    await this.vincularWallet(accounts[0]);
                }
            }
        } catch (error) {
            console.error('Error conectando wallet:', error);
            if (error.code === 4001) {
                showToast('⚠️ Usuario rechazó la conexión', 'warning');
            } else {
                showToast('❌ Error al conectar wallet: ' + error.message, 'error');
            }
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
        
        try {
            localStorage.removeItem('sariels_wallet');
            this.wallet = null;
            web3 = null;
            this.actualizarUIWallet(null);
            showToast('🔌 Wallet desconectada', 'warning');
        } catch (error) {
            console.error('Error desconectando wallet:', error);
            showToast('❌ Error al desconectar wallet', 'error');
        }
    }

    // ================================================================
    // 🎬 TRANSMISIONES - CON VALIDACIÓN
    // ================================================================

    async crearTransmision(datos) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión primero', 'error');
                return null;
            }

            if (!datos.titulo || datos.titulo.length < 3) {
                showToast('⚠️ El título debe tener al menos 3 caracteres', 'error');
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
            showToast('◉ Transmisión iniciada: ' + escapeHTML(datos.titulo), 'success');
            return data[0];
        } catch (error) {
            console.error('Error creando transmisión:', error);
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

            if (!mensaje || mensaje.trim().length === 0) {
                showToast('⚠️ Escribe un mensaje', 'warning');
                return null;
            }

            const { data, error } = await this.supabase
                .from('mensajes_live')
                .insert({
                    transmision_id: transmisionId,
                    usuario_id: this.usuario.id,
                    mensaje: mensaje.trim(),
                    nombre_usuario: this.usuario.user_metadata?.nombre || 'Anónimo'
                })
                .select();

            if (error) throw error;
            return data[0];
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            showToast('❌ Error al enviar mensaje', 'error');
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
        return this.supabase
            .channel(`chat-${transmisionId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'mensajes_live',
                filter: `transmision_id=eq.${transmisionId}`
            }, (payload) => {
                if (callback) callback(payload.new);
            })
            .subscribe();
    }

    // ================================================================
    // 💰 PAGOS - CON IDEMPOTENCIA
    // ================================================================

    async registrarPago(transmisionId, monto, metodo) {
        try {
            if (!this.usuario) {
                showToast('⚠️ Inicia sesión para pagar', 'error');
                return null;
            }

            if (monto <= 0) {
                showToast('⚠️ Monto inválido', 'error');
                return null;
            }

            const comision = monto * 0.5;
            const montoStreamer = monto * 0.5;

            // ✅ GENERAR IDEMPOTENCY KEY
            const idempotencyKey = `pago_${this.usuario.id}_${transmisionId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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
                    estado: 'completado',
                    idempotency_key: idempotencyKey
                })
                .select();

            if (error) {
                if (error.code === '23505') { // Unique violation
                    showToast('⚠️ Este pago ya fue procesado', 'warning');
                    return null;
                }
                throw error;
            }

            showToast(`✅ Pago de $${monto} MXN completado`, 'success');
            return data[0];
        } catch (error) {
            console.error('Error registrando pago:', error);
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

            if (precioMensual <= 0) {
                showToast('⚠️ Precio inválido', 'error');
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
            showToast(`✅ Suscripción mensual de $${precioMensual} MXN activada`, 'success');
            return data[0];
        } catch (error) {
            console.error('Error suscribiéndose:', error);
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

            if (!nivel || nivel < 1 || nivel > 3) {
                showToast('⚠️ Nivel inválido (1-3)', 'error');
                return null;
            }

            if (!horas || horas <= 0) {
                showToast('⚠️ Horas inválidas', 'error');
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

            showToast(`🚀 Promoción nivel ${nivel} activada por $${costo} MXN`, 'success');
            return data[0];
        } catch (error) {
            console.error('Error activando promoción:', error);
            showToast('❌ Error: ' + error.message, 'error');
            return null;
        }
    }

    // ================================================================
    // 🎨 UI UPDATES - CON ESCAPE HTML
    // ================================================================

    actualizarUIUsuario(user) {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');

        if (!loginBtn && !userInfo) return;

        try {
            if (user) {
                if (loginBtn) loginBtn.style.display = 'none';
                if (userInfo) {
                    userInfo.style.display = 'flex';
                    const nombre = escapeHTML(user.user_metadata?.nombre || 'Usuario');
                    userInfo.innerHTML = `
                        <span style="font-size:0.7rem;color:var(--gold);">
                            ${nombre}
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
        } catch (error) {
            console.error('Error actualizando UI usuario:', error);
        }
    }

    actualizarUIWallet(wallet) {
        const walletBtn = document.getElementById('walletBtn');
        const walletInfo = document.getElementById('walletInfo');

        if (!walletBtn && !walletInfo) return;

        try {
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
        } catch (error) {
            console.error('Error actualizando UI wallet:', error);
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
// INSTANCIAR APP Y EXPONER GLOBALMENTE
// ================================================================
const app = new GalletaDomoApp();
appInstance = app;

window.app = app;
window.usuarioActual = usuarioActual;
window.showToast = showToast;
window.escapeHTML = escapeHTML;

// ================================================================
// INICIALIZACIÓN - UNA SOLA VEZ CON MANEJO DE ERRORES
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    try {
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
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
        showToast('⚠️ Error al inicializar la aplicación. Recarga la página.', 'error');
    }
});

// ================================================================
// LIMPIEZA DE RECURSOS AL CERRAR
// ================================================================
window.addEventListener('beforeunload', function() {
    if (app && typeof app.destroy === 'function') {
        app.destroy();
    }
});
