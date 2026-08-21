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
        document.getElementById('connectWallet').addEventListener('click', () => this.conectarWallet());
        document.getElementById('buyDomo').addEventListener('click', () => this.buyDomo());
        document.getElementById('canjearNft').addEventListener('click', () => this.canjearNft());
        document.getElementById('loadMoreHistory').addEventListener('click', () => this.loadHistory(true));
    }

    loadQtyControls() {
        const decreaseBtn = document.getElementById('decreaseQty');
        const increaseBtn = document.getElementById('increaseQty');
        const qtyDisplay = document.getElementById('domoQuantity');

        decreaseBtn.addEventListener('click', () => {
            if (this.qty > 1) { this.qty--; qtyDisplay.textContent = this.qty; }
        });
        increaseBtn.addEventListener('click', () => {
            if (this.qty < 10) { this.qty++; qtyDisplay.textContent = this.qty; }
        });
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
            button.disabled = true;
            button.textContent = '⏳ Conectando...';

            // Supabase maneja: pedir cuenta, armar el mensaje SIWE,
            // pedir la firma a MetaMask, y verificarla en su backend.
            const { data, error } = await this.supabase.auth.signInWithWeb3({
                chain: 'ethereum',
                statement: 'Inicia sesión en Sariel\'s Ecosystem'
            });

            if (error) throw error;

            this.showNotification('✅ Wallet conectada exitosamente', 'success');
            // onAuthStateChange dispara onLoginSuccess() automáticamente

        } catch (error) {
            console.error('Error conectando wallet:', error);
            this.showNotification('❌ Error al conectar wallet: ' + error.message, 'error');
            document.getElementById('connectWallet').disabled = false;
            document.getElementById('connectWallet').textContent = '🔗 Conectar Wallet';
        }
    }

    async onLoginSuccess() {
        document.getElementById('connectWallet').textContent = '✅ Conectado';
        document.getElementById('connectWallet').disabled = false;
        document.getElementById('buyDomo').disabled = false;

        const walletAddress = this.session.user.user_metadata?.custom_claims?.address
            || this.session.user.user_metadata?.address;

        if (walletAddress) {
            document.getElementById('walletInfo').classList.remove('hidden');
            document.getElementById('walletAddress').textContent =
                `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        }

        await this.loadUserData();
    }

    onLogout() {
        document.getElementById('connectWallet').textContent = '🔗 Conectar Wallet';
        document.getElementById('buyDomo').disabled = true;
        document.getElementById('walletInfo').classList.add('hidden');
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
            'Authorization': `Bearer ${this.session.access_token}`,
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

            document.getElementById('tokensCount').textContent = data.tokensAcumulados || 0;

            const progreso = data.progresoCanje || 0;
            document.getElementById('progressFill').style.width = `${progreso}%`;
            document.getElementById('progressText').textContent = `${data.tokensAcumulados || 0}/12`;

            document.getElementById('canjearNft').disabled = !data.puedeCanjear;

            await this.loadHistory();

        } catch (error) {
            console.error('Error cargando datos:', error);
        }
    }

    // ============================================================
    // ESCANEAR QR DEL DOMO (cliente escanea el QR del domo)
    // ============================================================
    async escanearQR(qrCodigo) {
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
        try {
            const confirmar = confirm('⚠️ ¿Estás seguro de canjear tu NFT? Se quemarán 12 tokens.\n\nEsta acción es irreversible.');
            if (!confirmar) return;

            const button = document.getElementById('canjearNft');
            button.disabled = true;
            button.textContent = '⏳ Canjeando...';

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
                button.disabled = false;
            }
        } catch (error) {
            console.error('Error canjeando NFT:', error);
            this.showNotification('❌ Error al procesar el canje', 'error');
        } finally {
            document.getElementById('canjearNft').textContent = '🔥 Canjear NFT (12 tokens)';
        }
    }

    // ============================================================
    // HISTORIAL
    // ============================================================
    async loadHistory(loadMore = false) {
        try {
            this.currentPage = loadMore ? (this.currentPage || 1) + 1 : 1;

            const response = await fetch(
                `${this.apiUrl}/historial?page=${this.currentPage}&limit=20`,
                { headers: this.authHeaders() }
            );

            const data = await response.json();
            const historyDiv = document.getElementById('transactionHistory');

            if (data.transactions && data.transactions.length > 0) {
                historyDiv.innerHTML = data.transactions.map(tx => `
                    <div class="history-item ${tx.tipo}">
                        <span class="history-type">${this.getTransactionIcon(tx.tipo)} ${tx.tipo}</span>
                        <span class="history-amount">${tx.cantidad} tokens</span>
                        <span class="history-date">${new Date(tx.fecha).toLocaleDateString()}</span>
                    </div>
                `).join('');

                document.getElementById('loadMoreHistory').classList.toggle(
                    'hidden', data.pagination.pages <= this.currentPage
                );
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