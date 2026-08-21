// ================================================================
// APP.JS - VERSIÓN MÓVIL (Sin comandos, carga directa de Supabase)
// ================================================================

// 1. Cargamos Supabase directamente desde la nube (no necesitas instalar nada)
const supabase = window.supabase.createClient(
    'https://hbbwopkfpkvahgtawqke.supabase.co', 
    'sb_publishable_4gJWA-t7Eg6ruuI2EF-K2A_GQlahb2j'
);

class GalletaDomoApp {
    constructor() {
        this.apiUrl = 'https://galleta-domo.up.railway.app/api';
        this.init();
    }

    async init() {
        // Escucha cambios de sesión
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') alert('✅ ¡Conectado!');
        });
    }

    async conectarWallet() {
        try {
            // El login de Supabase Web3
            const { data, error } = await supabase.auth.signInWithWeb3({
                provider: 'ethereum',
            });
            if (error) throw error;
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }
}

const app = new GalletaDomoApp();