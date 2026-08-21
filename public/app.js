// ================================================================
// APP.JS - FRONTEND DE SARIEL'S CON SUPABASE AUTH (Web3 Wallet)
// ================================================================

const SUPABASE_URL = 'https://hbbwopkfpkvahgtawqke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j';

class GalletaDomoApp {
    constructor() {
        this.apiUrl = 'https://galleta-domo.up.railway.app/api';
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.session = null;
        this.qty = 1;
        this.currentPage = 1;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadQtyControls();

        // Restaura sesión si ya había una (Supabase la guarda en localStorage)
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.session = session;
            await this.onLoginSuccess();
        }

        // Reacciona a cambios de sesión (login, logout, refresh de token)
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            this.session = session;
            if (event === 'SIGNED_IN') {
                await this.onLoginSuccess();
            } else if (event === 'SIGNED_OUT') {
                this.onLogout();
            }
        });
    }

    setupEventListeners() {
        const connectBtn = document.getElementById('connectWallet');
        if (connectBtn) connectBtn.addEventListener('click', () => this.conectarWallet());

        const buyBtn = document.getElementById('buyDomo');
        if (buyBtn) buyBtn.addEventListener('click', () => this.buyDomo());

        const canjearBtn = document.getElementById('canjearNft');
        if (canjearBtn) canjearBtn.addEventListener('click', () => this.canjearNft());

        const loadMoreBtn = document.getElementById('loadMoreHistory');
        if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => this.loadHistory(true));

        // Botón de desconectar
        const disconnectBtn = document.getElementById('btnDisconnectWallet');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.desconectarWallet());
        }
    }

    loadQtyControls() {
        const decreaseBtn = document.getElementById('decreaseQty');
        const increaseBtn = document.getElementById('increaseQty');
        const qtyDisplay = document.getElementById('domoQuantity');

        if (decreaseBtn) {
            decreaseBtn.addEventListener('click', () => {
                if (this.qty > 1) { this.qty--; qtyDisplay.textContent = this.qty; }
            });
        }

        if (increaseBtn) {
            increaseBtn.addEventListener('click', () => {
                if (this.qty < 10) { this.qty++; qtyDisplay.textContent = this.qty; }
            });
        }
    }

    // ============================================================
    // LOGIN CON METAMASK VÍA SUPABASE (Sign in with Web3)
    // ============================================================
    async conectarWallet() {
        try {
            if (!window.ethereum) {
                this.showNotification('❌ Por favor instala MetaMask', 'error');
                window.open('https://metamask.io/download/', '_blank');
                return;
            }

            const button = document.getElementById('connectWallet');
            if (button) {
                button.disabled = true;
                button.textContent = '⏳ Conectando...';
            }

            const { data, error } = await this.supabase.auth.signInWithWeb3({
                chain: 'ethereum',
                statement: 'Inicia sesión en Sariel\'s Ecosystem'
            });

            if (error) throw error;

            this.showNotification('✅ Wallet conectada exitosamente', 'success');

        } catch (error) {
            console.error('Error conectando wallet:', error);
            this.showNotification('❌ Error al conectar wallet: ' + error.message, 'error');
            const button = document.getElementById('connectWallet');
            if (button) {
                button.disabled = false;
                button.textContent = '🔗 Conectar Wallet';
            }
        }
    }

    async onLoginSuccess() {
        const connectBtn = document.getElementById('connectWallet');
        if (connectBtn) {
            connectBtn.textContent = '✅ Conectado';
            connectBtn.disabled = false;
        }

        const buyBtn = document.getElementById('buyDomo');
        if (buyBtn) buyBtn.disabled = false;

        const walletAddress = this.session.user?.user_metadata?.custom_claims?.address
            || this.session.user?.user_metadata?.address;

        if (walletAddress) {
            const walletInfo = document.getElementById('walletInfo');
            if (walletInfo) walletInfo.classList.remove('hidden');

            const addressEl = document.getElementById('walletAddress');
            if (addressEl) {
                addressEl.textContent = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
            }
        }

        await this.loadUserData();
    }

    onLogout() {
        const connectBtn = document.getElementById('connectWallet');
        if (connectBtn) {
            connectBtn.textContent = '🔗 Conectar Wallet';
            connectBtn.disabled = false;
        }

        const buyBtn = document.getElementById('buyDomo');
        if (buyBtn) buyBtn.disabled = true;

        const walletInfo = document.getElementById('walletInfo');
        if (walletInfo) walletInfo.classList.add('hidden');
    }

    async desconectarWallet() {
        await this.supabase.auth.signOut();
        this.showNotification('Wallet desconectada', 'info');
    }

    // ============================================================
    // HEADERS PARA LLAMAR AL BACKEND (Railway)
    // ============================================================
    authHeaders() {
        return {
            'Authorization': `Bearer ${this.session?.access_token || ''}`,
            'Content-Type': 'application/json'
        };
    }

    // ============================================================
    // ESTADO DEL USUARIO
    // ============================================================
    async loadUserData() {
        if (!this.session) return;

        try {
            const response = await fetch(`${this.apiUrl}/estado`, {
                headers: this.authHeaders()
            });

            if (!response.ok) throw new Error('Error al cargar datos');

            const data = await response.json();

            const tokensCount = document.getElementById('tokensCount');
            if (tokensCount) tokensCount.textContent = data.tokensAcumulados || 0;

            const progreso = data.progresoCanje || 0;
            const progressFill = document.getElementById('progressFill');
            if (progressFill) progressFill.style.width = `${progreso}%`;

            const progressText = document.getElementById('progressText');
            if (progressText) progressText.textContent = `${data.tokensAcumulados || 0}/12`;

            const canjearBtn = document.getElementById('canjearNft');
            if (canjearBtn) canjearBtn.disabled = !data.puedeCanjear;

            await this.loadHistory();

        } catch (error) {
            console.error('Error cargando datos:', error);
        }
    }

    // ============================================================
    // COMPRAR DOMO
    // ============================================================
    async buyDomo() {
        if (!this.session) {
            this.showNotification('⚠️ Conecta tu wallet primero', 'error');
            return;
        }

        const button = document.getElementById('buyDomo');
        if (button) {
            button.disabled = true;
            button.textContent = '⏳ Procesando...';
        }

        try {
            const response = await fetch(`${this.apiUrl}/domo/comprar`, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({ cantidad: this.qty, metodoPago: 'efectivo' })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification(`✅ ${this.qty} domo(s) comprado(s)`, 'success');
                await this.loadUserData();
            } else {
                this.showNotification(data.error || '❌ Error al comprar domo', 'error');
            }
        } catch (error) {
            console.error('Error comprando domo:', error);
            this.showNotification('❌ Error al procesar la compra', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Comprar Domo';
            }
        }
    }

    // ============================================================
    // ESCANEAR QR DEL DOMO
    // ============================================================
    async escanearQR(qrCodigo) {
        if (!this.session) {
            this.showNotification('⚠️ Conecta tu wallet primero', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.apiUrl}/qr/escanear`, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({ qrCodigo })
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification(`✅ Token acumulado: ${data.tokens_acumulados}/12`, 'success');
                await this.loadUserData();
            } else {
                this.showNotification(data.error || '❌ QR inválido', 'error');
            }
        } catch (error) {
            console.error('Error escaneando QR:', error);
            this.showNotification('❌ Error al procesar el QR', 'error');
        }
    }

    // ============================================================
    // CANJEAR NFT
    // ============================================================
    async canjearNft() {
        if (!this.session) {
            this.showNotification('⚠️ Conecta tu wallet primero', 'error');
            return;
        }

        const confirmar = confirm('⚠️ ¿Estás seguro de canjear tu NFT? Se quemarán 12 tokens.\n\nEsta acción es irreversible.');
        if (!confirmar) return;

        const button = document.getElementById('canjearNft');
        if (button) {
            button.disabled = true;
            button.textContent = '⏳ Canjeando...';
        }

        try {
            const response = await fetch(`${this.apiUrl}/nft/canjear`, {
                method: 'POST',
                headers: this.authHeaders()
            });

            const data = await response.json();

            if (data.success) {
                this.showNotification('✅ Canje registrado. Tienes 30 días para recogerlo.', 'success');
                await this.loadUserData();
            } else {
                this.showNotification(data.error || '❌ Error al canjear NFT', 'error');
                if (button) button.disabled = false;
            }
        } catch (error) {
            console.error('Error canjeando NFT:', error);
            this.showNotification('❌ Error al procesar el canje', 'error');
        } finally {
            if (button) {
                button.textContent = '🔥 Canjear NFT (12 tokens)';
                button.disabled = false;
            }
        }
    }

    // ============================================================
    // HISTORIAL
    // ============================================================
    async loadHistory(loadMore = false) {
        if (!this.session) return;

        try {
            this.currentPage = loadMore ? (this.currentPage || 1) + 1 : 1;

            const response = await fetch(
                `${this.apiUrl}/historial?page=${this.currentPage}&limit=20`,
                { headers: this.authHeaders() }
            );

            const data = await response.json();
            const historyDiv = document.getElementById('transactionHistory');

            if (!historyDiv) return;

            if (data.transactions && data.transactions.length > 0) {
                historyDiv.innerHTML = data.transactions.map(tx => `
                    <div class="history-item ${tx.tipo}">
                        <span class="history-type">${this.getTransactionIcon(tx.tipo)} ${tx.tipo}</span>
                        <span class="history-amount">${tx.cantidad} tokens</span>
                        <span class="history-date">${new Date(tx.fecha).toLocaleDateString()}</span>
                    </div>
                `).join('');

                const loadMoreBtn = document.getElementById('loadMoreHistory');
                if (loadMoreBtn) {
                    loadMoreBtn.classList.toggle('hidden', data.pagination?.pages <= this.currentPage);
                }
            } else {
                historyDiv.innerHTML = '<p class="empty-message">📭 No hay transacciones aún</p>';
            }
        } catch (error) {
            console.error('Error cargando historial:', error);
        }
    }

    getTransactionIcon(tipo) {
        const icons = {
            'qr_escaneado': '📱',
            'canje_nft': '🔥',
            'venta_p2p': '💰',
            'compra_p2p': '🛒'
        };
        return icons[tipo] || '📝';
    }

    showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        div.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 15px 25px;
            background: ${type === 'success' ? 'var(--gold-cosmic)' : type === 'error' ? 'var(--danger)' : 'var(--text-secondary)'};
            color: ${type === 'success' ? 'var(--space-deep)' : 'white'};
            border-radius: 12px; z-index: 9999; max-width: 400px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            font-weight: 500; font-family: 'Space Grotesk', sans-serif;
            border: 1px solid rgba(212, 175, 55, 0.15);
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GalletaDomoApp();
});