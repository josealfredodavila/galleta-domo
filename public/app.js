// ================================================================
// APP.JS - VERSIÓN COMPLETA CON SUPABASE + WALLET + AUTENTICACIÓN
// ================================================================

// ================================================================
// CONFIGURACIÓN SUPABASE
// ================================================================
const SUPABASE_URL = 'https://hbbwopkfpkvahgtawqke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================================================================
// VARIABLES GLOBALES
// ================================================================
let usuarioActual = null;
let walletConectada = false;
let web3 = null;

// ================================================================
// CLASE PRINCIPAL
// ================================================================
class GalletaDomoApp {
    constructor() {
        this.supabase = supabaseClient;
        this.apiUrl = 'https://galleta-domo.up.railway.app/api';
        this.usuario = null;
        this.wallet = null;
        this.init();
    }

    async init() {
        console.log('◈ Sariel\'s - App inicializada');

        // Verificar sesión existente
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.usuario = session.user;
            usuarioActual = session.user;
            this.actualizarUIUsuario(session.user);
        }

        // Escuchar cambios de autenticación
        this.supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.usuario = session.user;
                usuarioActual = session.user;
                this.actualizarUIUsuario(session.user);
                showToast('✅ ¡Bienvenido ' + (session.user.user_metadata?.nombre || 'Usuario') + '!');
            }
            if (event === 'SIGNED_OUT') {
                this.usuario = null;
                usuarioActual = null;
                this.actualizarUIUsuario(null);
                showToast('🔌 Sesión cerrada');
            }
        });

        // Conectar wallet si hay guardada
        const walletGuardada = localStorage.getItem('sariels_wallet');
        if (walletGuardada) {
            this.wallet = walletGuardada;
            this.actualizarUIWallet(walletGuardada);
        }
    }

    // ================================================================
    // AUTENTICACIÓN CON EMAIL
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

    // ================================================================
    // 🔐 RECUPERAR CONTRASEÑA - VERSIÓN PRO
    // ================================================================
    async recuperarContraseña(email) {
        try {
            const { data, error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://galleta-domo.up.railway.app/actualizar-contraseña.html'
            });

            if (error) throw error;
            
            // ✅ MENSAJE PRO
            showToast('📧 ¡Listo! Te enviamos un enlace a tu correo. Revisa tu bandeja.');
            return true;
        } catch (error) {
            // ✅ MENSAJE PRO
            showToast('❌ No encontramos ese correo. Verifica que esté bien escrito.', 'error');
            return false;
        }
    }

    // ================================================================
    // 🔐 ACTUALIZAR CONTRASEÑA - VERSIÓN PRO
    // ================================================================
    async actualizarContraseña(nuevaContraseña) {
        try {
            const { data, error } = await this.supabase.auth.updateUser({
                password: nuevaContraseña
            });

            if (error) throw error;
            
            // ✅ MENSAJE PRO
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
            
            // Buscar usuario por wallet en Supabase
            const { data, error } = await this.supabase
                .from('usuarios')
                .select('email')
                .eq('wallet', wallet)
                .single();

            if (error || !data) {
                showToast('⚠️ No hay cuenta asociada a esta wallet', 'error');
                return;
            }

            // Enviar recuperación al email registrado
            await this.recuperarContraseña(data.email);
            
        } catch (error) {
            showToast('❌ Error: ' + error.message, 'error');
        }
    }

    // ================================================================
    // CERRAR SESIÓN
    // ================================================================
    async cerrarSesion() {
        try {
            await this.supabase.auth.signOut();
            localStorage.removeItem('sariels_wallet');
            this.wallet = null;
            this.usuario = null;
            usuarioActual = null;
            showToast('🔌 Sesión cerrada');
        } catch (error) {
            showToast('❌ Error al cerrar sesión', 'error');
        }
    }

    // ================================================================
    // WALLET (MetaMask)
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
            
            // Verificar red (Polygon)
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
                
                // Vincular wallet con Supabase (si está autenticado)
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

    // ================================================================
    // TRANSMISIONES
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
    // CHAT
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

    // Suscribirse a nuevos mensajes (Realtime)
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
    // PAGOS
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
    // SUSCRIPCIONES
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
    // PROMOCIONES
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

            // Actualizar transmisión
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
    // UI UPDATES
    // ================================================================
    actualizarUIUsuario(user) {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');

        if (user && loginBtn) {
            loginBtn.style.display = 'none';
            if (userInfo) {
                userInfo.style.display = 'flex';
                userInfo.innerHTML = `
                    <span style="font-size:0.7rem;color:var(--gold);">
                        ${user.user_metadata?.nombre || 'Usuario'}
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

        if (wallet && walletBtn) {
            walletBtn.style.display = 'none';
            if (walletInfo) {
                walletInfo.style.display = 'flex';
                walletInfo.innerHTML = `
                    <span style="font-size:0.6rem;color:var(--text-muted);">
                        🟢 ${wallet.slice(0, 6)}...${wallet.slice(-4)}
                    </span>
                    <button onclick="app.desconectarWalletUI()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.5rem;">
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

    desconectarWalletUI() {
        localStorage.removeItem('sariels_wallet');
        this.wallet = null;
        this.actualizarUIWallet(null);
        showToast('🔌 Wallet desconectada');
    }
}

// ================================================================
// TOAST
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
    else t.classList.remove('error', 'warning');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 3500);
}

// ================================================================
// INSTANCIAR APP
// ================================================================
const app = new GalletaDomoApp();

// Exponer para uso global
window.app = app;
window.usuarioActual = usuarioActual;
window.showToast = showToast;

// ================================================================
// INICIALIZAR CUANDO EL DOM ESTÉ LISTO
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('◈ Sariel\'s App - Lista');
    console.log('◉ Supabase conectado');
    console.log('◆ Wallet: ' + (localStorage.getItem('sariels_wallet') ? 'Conectada' : 'Desconectada'));
    
    // Agregar botones de autenticación en el header si no existen
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        // Buscar si ya existen
        if (!document.getElementById('loginBtn')) {
            const loginBtn = document.createElement('button');
            loginBtn.id = 'loginBtn';
            loginBtn.className = 'nav-link';
            loginBtn.textContent = '◆ Conectar';
            loginBtn.onclick = () => {
                const email = prompt('Correo:');
                if (email) {
                    const pass = prompt('Contraseña:');
                    if (pass) app.iniciarSesion(email, pass);
                }
            };
            headerActions.appendChild(loginBtn);
        }
        
        if (!document.getElementById('walletBtn')) {
            const walletBtn = document.createElement('button');
            walletBtn.id = 'walletBtn';
            walletBtn.className = 'nav-link admin';
            walletBtn.textContent = '◈ Wallet';
            walletBtn.onclick = () => app.conectarWallet();
            headerActions.appendChild(walletBtn);
        }
        
        if (!document.getElementById('userInfo')) {
            const userInfo = document.createElement('div');
            userInfo.id = 'userInfo';
            userInfo.style.cssText = 'display:none;align-items:center;gap:8px;';
            headerActions.appendChild(userInfo);
        }
        
        if (!document.getElementById('walletInfo')) {
            const walletInfo = document.createElement('div');
            walletInfo.id = 'walletInfo';
            walletInfo.style.cssText = 'display:none;align-items:center;gap:8px;';
            headerActions.appendChild(walletInfo);
        }
    }

    // Recuperar sesión
    app.init();
});