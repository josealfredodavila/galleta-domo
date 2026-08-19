// public/app.js
class GalletaDomoApp {
    constructor() {
        this.web3 = null;
        this.account = null;
        this.token = localStorage.getItem('galleta_token') || null;
        this.userData = null;
        this.currentPage = 1;
        this.qty = 1;
        
        // URL de la API - detecta automáticamente
        this.apiUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api'
            : '/api';
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.loadQtyControls();
        
        if (this.token) {
            await this.loadUserData();
            document.getElementById('connectWallet').textContent = '✅ Conectado';
            document.getElementById('buyDomo').disabled = false;
        }
        
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnectWallet();
                } else {
                    this.account = accounts[0];
                    this.updateUI();
                }
            });
        }
    }
    
    setupEventListeners() {
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('buyDomo').addEventListener('click', () => this.buyDomo());
        document.getElementById('canjearNft').addEventListener('click', () => this.canjearNft());
        document.getElementById('loadMoreHistory').addEventListener('click', () => this.loadHistory(true));
    }
    
    loadQtyControls() {
        const decreaseBtn = document.getElementById('decreaseQty');
        const increaseBtn = document.getElementById('increaseQty');
        const qtyDisplay = document.getElementById('domoQuantity');
        
        decreaseBtn.addEventListener('click', () => {
            if (this.qty > 1) {
                this.qty--;
                qtyDisplay.textContent = this.qty;
            }
        });
        
        increaseBtn.addEventListener('click', () => {
            if (this.qty < 10) {
                this.qty++;
                qtyDisplay.textContent = this.qty;
            }
        });
    }
    
    async connectWallet() {
        try {
            if (!window.ethereum) {
                this.showNotification('❌ Por favor instala MetaMask', 'error');
                window.open('https://metamask.io/download/', '_blank');
                return;
            }
            
            this.web3 = new Web3(window.ethereum);
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            const accounts = await this.web3.eth.getAccounts();
            this.account = accounts[0];
            
            const chainId = await this.web3.eth.getChainId();
            if (chainId !== 137) {
                await this.switchToPolygon();
            }
            
            const response = await fetch(`${this.apiUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: this.account })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.token = data.token;
                localStorage.setItem('galleta_token', data.token);
                this.userData = data.user;
                
                this.updateUI();
                await this.loadUserData();
                
                document.getElementById('connectWallet').textContent = '✅ Conectado';
                document.getElementById('buyDomo').disabled = false;
                
                this.showNotification('✅ Wallet conectada exitosamente', 'success');
            }
            
        } catch (error) {
            console.error('Error conectando wallet:', error);
            this.showNotification('❌ Error al conectar wallet', 'error');
        }
    }
    
    async switchToPolygon() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x89' }],
            });
        } catch (error) {
            if (error.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: '0x89',
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: {
                            name: 'MATIC',
                            symbol: 'MATIC',
                            decimals: 18
                        },
                        rpcUrls: ['https://polygon-mainnet.g.alchemy.com/v2/demo'],
                        blockExplorerUrls: ['https://polygonscan.com']
                    }]
                });
            } else {
                throw error;
            }
        }
    }
    
    disconnectWallet() {
        this.account = null;
        this.token = null;
        localStorage.removeItem('galleta_token');
        document.getElementById('connectWallet').textContent = '🔗 Conectar Wallet';
        document.getElementById('buyDomo').disabled = true;
        document.getElementById('walletInfo').classList.add('hidden');
        this.showNotification('Wallet desconectada', 'info');
    }
    
    async loadUserData() {
        if (!this.token || !this.account) return;
        
        try {
            const response = await fetch(`${this.apiUrl}/estado/${this.account}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) throw new Error('Error al cargar datos');
            
            const data = await response.json();
            this.userData = data;
            
            document.getElementById('domosCount').textContent = data.domosComprados || 0;
            document.getElementById('tokensCount').textContent = data.tokensAcumulados || 0;
            
            const haCanjeado = data.haCanjeado || false;
            document.getElementById('haCanjeado').textContent = haCanjeado ? '✅ Sí' : '❌ No';
            document.getElementById('haCanjeado').className = `status-value ${haCanjeado ? 'canjeado' : ''}`;
            
            const progreso = parseInt(data.progresoCanje) || 0;
            document.getElementById('progressFill').style.width = `${Math.min(progreso, 100)}%`;
            document.getElementById('progressText').textContent = `${data.tokensAcumulados || 0}/12`;
            
            const puedeCanjear = data.puedeCanjear || false;
            document.getElementById('canjearNft').disabled = !puedeCanjear;
            
            if (haCanjeado) {
                document.getElementById('canjeInfo').classList.remove('hidden');
                document.getElementById('canjearNft').disabled = true;
            }
            
            await this.loadHistory();
            this.updateUI();
            
        } catch (error) {
            console.error('Error cargando datos:', error);
            if (error.message.includes('401')) {
                this.disconnectWallet();
            }
        }
    }
    
    async buyDomo() {
        try {
            if (!this.account || !this.token) {
                this.showNotification('⚠️ Conecta tu wallet primero', 'error');
                return;
            }
            
            const button = document.getElementById('buyDomo');
            button.disabled = true;
            button.textContent = '⏳ Procesando...';
            
            const response = await fetch(`${this.apiUrl}/comprar-domo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cantidad: this.qty })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const qrContainer = document.getElementById('qrContainer');
                qrContainer.classList.remove('hidden');
                
                const qrCodeDiv = document.getElementById('qrCode');
                qrCodeDiv.innerHTML = '';
                
                if (data.qrImages && data.qrImages.length > 0) {
                    data.qrImages.forEach((qrImage, index) => {
                        const img = document.createElement('img');
                        img.src = qrImage;
                        img.alt = `QR ${index + 1}`;
                        img.className = 'qr-image';
                        qrCodeDiv.appendChild(img);
                    });
                }
                
                this.showNotification(`✅ ${data.cantidad} domo(s) comprado(s)`, 'success');
                await this.loadUserData();
                
                setTimeout(() => {
                    qrContainer.classList.add('hidden');
                }, 30000);
            } else {
                this.showNotification(data.error || '❌ Error al comprar domo', 'error');
            }
        } catch (error) {
            console.error('Error comprando domo:', error);
            this.showNotification('❌ Error al procesar la compra', 'error');
        } finally {
            document.getElementById('buyDomo').disabled = false;
            document.getElementById('buyDomo').textContent = 'Comprar Domo';
        }
    }
    
    async canjearNft() {
        try {
            if (!this.account || !this.token) {
                this.showNotification('⚠️ Conecta tu wallet primero', 'error');
                return;
            }
            
            const confirmar = confirm('⚠️ ¿Estás seguro de canjear tu NFT? Se quemarán 12 tokens.\n\nEsta acción es irreversible.');
            if (!confirmar) return;
            
            const button = document.getElementById('canjearNft');
            button.disabled = true;
            button.textContent = '⏳ Canjeando...';
            
            const response = await fetch(`${this.apiUrl}/canjear-nft`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('✅ NFT canjeado exitosamente', 'success');
                await this.loadUserData();
                document.getElementById('canjeInfo').classList.remove('hidden');
                button.disabled = true;
            } else {
                this.showNotification(data.error || '❌ Error al canjear NFT', 'error');
                button.disabled = false;
            }
        } catch (error) {
            console.error('Error canjeando NFT:', error);
            this.showNotification('❌ Error al procesar el canje', 'error');
            document.getElementById('canjearNft').disabled = false;
        } finally {
            document.getElementById('canjearNft').textContent = '🔥 Canjear NFT (12 tokens)';
        }
    }
    
    async loadHistory(loadMore = false) {
        try {
            if (loadMore) this.currentPage++;
            
            const response = await fetch(
                `${this.apiUrl}/historial/${this.account}?page=${this.currentPage}&limit=20`,
                { headers: { 'Authorization': `Bearer ${this.token}` } }
            );
            
            const data = await response.json();
            const historyDiv = document.getElementById('transactionHistory');
            
            if (data.transactions && data.transactions.length > 0) {
                const txs = data.transactions;
                historyDiv.innerHTML = txs.map(tx => `
                    <div class="history-item ${tx.tipo}">
                        <span class="history-type">${this.getTransactionIcon(tx.tipo)} ${tx.tipo.toUpperCase()}</span>
                        <span class="history-amount">${tx.cantidad || 0} ${tx.cantidad === 1 ? 'token' : 'tokens'}</span>
                        <span class="history-date">${new Date(tx.fecha).toLocaleDateString()}</span>
                    </div>
                `).join('');
                
                const loadMoreBtn = document.getElementById('loadMoreHistory');
                if (data.pagination && data.pagination.pages > this.currentPage) {
                    loadMoreBtn.classList.remove('hidden');
                } else {
                    loadMoreBtn.classList.add('hidden');
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
            'compra': '🛒',
            'canje': '🔥',
            'quemado': '💀',
            'qr_generado': '📱'
        };
        return icons[tipo] || '📝';
    }
    
    updateUI() {
        const walletInfo = document.getElementById('walletInfo');
        const walletAddress = document.getElementById('walletAddress');
        
        if (this.account) {
            walletInfo.classList.remove('hidden');
            walletAddress.textContent = `${this.account.slice(0, 6)}...${this.account.slice(-4)}`;
        } else {
            walletInfo.classList.add('hidden');
        }
    }
    
    showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        div.style.cssText = `
            position: fixed;
            top: 20px;