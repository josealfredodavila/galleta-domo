// ================================================================
// AUTENTICACIÓN WEB3 Y GESTIÓN DE SESIÓN (app.js actualizado)
// ================================================================

/**
 * Función principal para conectar la Wallet y preparar la sesión.
 * Ahora incluye una lógica limpia para interactuar con Supabase.
 */
async function conectarWalletWeb3() {
    // Verificación de existencia de provider
    if (!window.ethereum) {
        showToast('⚠️ Por favor, instala MetaMask u otra wallet Web3 compatible.', 'error');
        return;
    }

    try {
        // 1. Obtener acceso a la cuenta
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = accounts[0];

        showToast('🔄 Solicitando firma para acceso seguro...');

        // 2. Autenticación con Supabase (Basado en tu implementación)
        // Nota: Asegúrate de tener configurado el Auth de Web3 en el dashboard de Supabase
        const { data, error } = await supabase.auth.signInWithWeb3({
            provider: 'ethereum',
            statement: 'Bienvenido a Sariel\'s. Firmar este mensaje para iniciar sesión de forma segura.',
        });

        if (error) {
            console.error('Error en Supabase Auth:', error);
            throw new Error(error.message || 'Error al autenticar con Supabase');
        }

        // 3. Persistencia de perfil local
        const userProfile = {
            nombre: address.substring(0, 6) + '...' + address.substring(address.length - 4),
            wallet: address,
            avatar: '◈',
            timestamp: new Date().getTime()
        };
        
        localStorage.setItem('sariels_perfil', JSON.stringify(userProfile));

        showToast('✅ ¡Wallet conectada! Bienvenido a Sariel\'s.');
        
        // Recarga para refrescar estados de UI (como botones de inicio de transmisión)
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (err) {
        console.error('Error crítico en autenticación:', err);
        showToast('❌ ' + (err.message || 'Error al conectar la wallet'), 'error');
    }
}

/**
 * Función de utilidad para mostrar notificaciones (Toast)
 * Mantiene la consistencia en toda la plataforma
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.innerText = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3500);
}

/**
 * Función para obtener el estado de la sesión (Útil para LiveKit)
 * LiveKit necesitará saber quién está entrando a la sala.
 */
function obtenerUsuarioAutenticado() {
    const perfil = localStorage.getItem('sariels_perfil');
    return perfil ? JSON.parse(perfil) : null;
}

// Inicialización de listeners básicos al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Si la wallet cambia, cerrar sesión por seguridad
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                localStorage.removeItem('sariels_perfil');
                window.location.reload();
            }
        });
    }
});