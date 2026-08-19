class GalletaDomoApp {
    constructor() {
        this.web3 = null;
        this.account = null;
        this.contract = null;
        this.apiUrl = 'http://localhost:3001/api';
        this.token = localStorage.getItem('token') || null;
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        
        // Verificar conexión previa
        if (this.token) {
            await this.loadUserData();
        }
    }
    
    setupEventListeners() {
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('buyDomo').addEventListener('click', () => this.buyDomo());
        document.getElementById('canjearNft').addEventListener('click', () => this.canjearNft());
    }
    
    async connectWallet() {
        try {
            if (window.ethereum) {
                this.web3 = new Web3(window.ethereum);
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                
                const accounts = await this.web3.eth.getAccounts();
                this.account = accounts[0];
                
                // Registrar en backend
                const response = await fetch(`${this.apiUrl}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        walletAddress: this.account,
                        email: 'usuario@email.com' // Opcional
                    })
                });
                
                const data = await response.json();
                this.token = data.token;
                localStorage.setItem('token', data.token);
                
                this.updateUI();
                await this.loadUserData();
                
                document.getElementById('connectWallet').disabled = true;
                document.getElementById('buyDomo').disabled = false;
                
                this.showNotification('Wallet conectada exitosamente', 'success');
            } else {
                this.showNotification('Por favor instala MetaMask', 'error');
            }
        } catch (error) {
            console.error('Error conectando wallet:', error);
            this.showNotification('Error al conectar wallet', 'error');
        }
    }
    
    async loadUserData() {
        try {
            const response = await fetch(`${this.apiUrl}/estado/${this.account}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const data = await response.json();
            
            document.getElementById('domosCount').textContent = data.domosComprados;
            document.getElementById('tokensCount').textContent = data.tokensAcumulados;
            
            const puedeCanjear = data.puedeCanjear || (data.tokensAcumulados >= 12 && !data.haCanjeado);
            document.getElementById('canCanjear').textContent = puedeCanjear ? 'Sí' : 'No';
            document.getElementById('canCanjear').className = `value ${puedeCanjear ? 'active' : ''}`;
            
            document.getElementById('haCanjeado').textContent = data.haCanjeado ? 'Sí' : 'No';
            document.getElementById('haCanjeado').className = `value ${data.haCanjeado ? 'active' : ''}`;
            
            document.getElementById('canjearNft').disabled = !puedeCanjear;
            
            await this.loadHistory();
            
        } catch (error) {
            console.error('Error cargando datos:', error);
        }
    }
    
    async buyDomo() {
        try {
            if (!this.account) {
                this.showNotification('Conecta tu wallet primero', 'error');
                return;
            }
            
            document.getElementById('buyDomo').disabled = true;
            document.getElementById('buyDomo').textContent = 'Procesando...';
            
            const response = await fetch(`${this.apiUrl}/comprar-domo`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Mostrar QR
                const qrContainer = document.getElementById('qrContainer');
                qrContainer.classList.remove('hidden');
                
                new QRCode(document.getElementById('qrCode'), {
                    text: data.qrId,
                    width: 200,
                    height: 200
                });
                
                this.showNotification('Domo comprado exitosamente', 'success');
                await this.loadUserData();
            } else {
                this.showNotification(data.error || 'Error al comprar domo', 'error');
            }
        } catch (error) {
            console.error('Error comprando domo:', error);
            this.showNotification('Error al procesar la compra', 'error');
        } finally {
            document.getElementById('buyDomo').disabled = false;
            document.getElementById('buyDomo').textContent = 'Comprar Domo';
        }
    }
    
    async canjearNft() {
        try {
            if (!this.account) {
                this.showNotification('Conecta tu wallet primero', 'error');
                return;
            }
            
            const confirmar = confirm('¿Estás seguro de canjear tu NFT? Se quemarán 12 tokens.');
            if (!confirmar) return;
            
            document.getElementById('canjearNft').disabled = true;
            document.getElementById('canjearNft').textContent = 'Canjeando...';
            
            const response = await fetch(`${this.apiUrl}/canjear-nft`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('NFT canjeado exitosamente', 'success');
                await this.loadUserData();
            } else {
                this.showNotification(data.error || 'Error al canjear NFT', 'error');
            }
        } catch (error) {
            console.error('Error canjeando NFT:', error);
            this.showNotification('Error al procesar el canje', 'error');
        } finally {
            document.getElementById('canjearNft').disabled = false;
            document.getElementById('canjearNft').textContent = '🔥 Canjear NFT (12 tokens)';
        }
    }
    
    async loadHistory() {
        try {
            const response = await fetch(`${this.apiUrl}/historial/${this.account}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const transactions = await response.json();
            const historyDiv = document.getElementById('transactionHistory');
            
            if (transactions.length === 0) {
                historyDiv.innerHTML = '<p class="empty-message">No hay transacciones aún</p>';
                return;
            }
            
            historyDiv.innerHTML = transactions.map(tx => `
                <div class="history-item">
                    <span class="type type-${tx.tipo}">${tx.tipo.toUpperCase()}</span>
                    <span>${tx.cantidad} tokens</span>
                    <span style="font-size:0.8rem;opacity:0.6">${new Date(tx.fecha).toLocaleDateString()}</span>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error cargando historial:', error);
        }
    }
    
    updateUI() {
        const walletInfo = document.getElementById('walletInfo');
        if (this.account) {
            walletInfo.innerHTML = `
                <strong>Wallet:</strong> ${this.account.substring(0, 6)}...${this.account.substring(38)}
            `;
        }
    }
    
    showNotification(message, type = 'info') {
        // Sistema simple de notificaciones
        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? 'var(--primary)' : 'var(--error)'};
            color: white;
            border-radius: 10px;
            z-index: 9999;
            animation: slideIn 0.5s ease;
        `;
        div.textContent = message;
        document.body.appendChild(div);
        
        setTimeout(() => {
            div.style.animation = 'slideOut 0.5s ease';
            setTimeout(() => div.remove(), 500);
        }, 3000);
    }
}

// Inicializar app
const app = new GalletaDomoApp();