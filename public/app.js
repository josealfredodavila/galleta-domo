// ================================================================
// AUTENTICACIÓN WEB3 CON SUPABASE (Reemplazo para app.js)
// ================================================================

async function conectarWalletWeb3() {
    if (!window.ethereum) {
        showToast('⚠️ Por favor instala MetaMask u otra wallet Web3', 'error');
        return;
    }

    try {
        // 1. Obtener la dirección de la wallet desde MetaMask
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const address = await signer.getAddress();

        showToast('🔄 Firmando mensaje de autenticación...');

        // 2. Firma del mensaje con Supabase Web3 Auth
        const { data, error } = await supabase.auth.signInWithWeb3({
            provider: 'ethereum',
            statement: 'Iniciar sesión en Sariels Web3 Application',
        });

        if (error) throw error;

        // 3. Guardar sesión y perfil local
        localStorage.setItem('sariels_perfil', JSON.stringify({
            nombre: address.substring(0, 6) + '...' + address.substring(address.length - 4),
            wallet: address,
            avatar: '◈'
        }));

        showToast('✅ Wallet conectada exitosamente');
        window.location.reload();

    } catch (err) {
        console.error('Error al conectar Web3:', err);
        showToast('❌ Error en autenticación Web3: ' + (err.message || 'Firma cancelada'), 'error');
    }
}
