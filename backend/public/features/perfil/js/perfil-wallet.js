// ================================================================
// PERFIL · WALLET (MetaMask + Polygon Amoy)
// ================================================================
// Conectar/desconectar wallet con MetaMask, cambiar a Polygon Amoy
// y vincular la dirección al perfil del usuario.
// Depende de: perfil-config.js, perfil-utils.js
// ================================================================

// ================================================================
// CONECTAR WALLET
// ================================================================
async function conectarWallet() {
    // 1. Verificar que MetaMask esté disponible
    if (typeof window.ethereum === 'undefined') {
        showToast('⚠️ Instala MetaMask para conectar tu wallet', 'error', 5000);
        setTimeout(() => {
            window.open('https://metamask.io/es/download', '_blank', 'noopener,noreferrer');
        }, 800);
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        // 2. Pedir cuentas a MetaMask
        let accounts;
        try {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        } catch (err) {
            if (err.code === 4001) showToast('❌ Cancelaste la conexión en MetaMask', 'warning');
            else showToast('❌ Error al abrir MetaMask', 'error');
            return;
        }
        if (!accounts || accounts.length === 0) {
            showToast('❌ No se obtuvo ninguna cuenta', 'error');
            return;
        }

        const cuenta = accounts[0];

        // 3. Verificar/cambiar a Polygon Amoy
        let chainId = await window.ethereum.request({ method: 'eth_chainId' });

        if (chainId !== ENV.networkChainId) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ENV.networkChainId }]
                });
                chainId = ENV.networkChainId;
            } catch (switchError) {
                // Red no existe, agregarla
                if (switchError.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: ENV.networkChainId,
                                chainName: ENV.networkName,
                                nativeCurrency: {
                                    name: ENV.networkCurrency,
                                    symbol: ENV.networkCurrency,
                                    decimals: 18
                                },
                                rpcUrls: [ENV.networkRPC],
                                blockExplorerUrls: [ENV.networkExplorer]
                            }]
                        });
                        chainId = ENV.networkChainId;
                    } catch (addError) {
                        showToast('❌ No se pudo agregar la red Polygon Amoy', 'error');
                        return;
                    }
                } else {
                    showToast('❌ No se pudo cambiar a Polygon Amoy', 'error');
                    return;
                }
            }
        }

        // 4. Guardar en Supabase (RPC)
        const { error: rpcErr } = await window.supabaseClient.rpc('vincular_wallet', {
            p_wallet_address: cuenta,
            p_chain_id: chainId,
            p_network_name: ENV.networkName
        });
        if (rpcErr) throw rpcErr;

        showToast('✅ Wallet conectada a ' + ENV.networkName, 'success', 4000);
        await cargarPerfil(true);
    } catch (error) {
        if (error.code === -32002) {
            showToast('⚠️ MetaMask ya tiene una solicitud pendiente', 'warning', 5000);
        } else {
            showToast('❌ Error al conectar wallet: ' + msgError(error), 'error');
        }
    }
}

// ================================================================
// DESCONECTAR WALLET
// ================================================================
async function desconectarWallet() {
    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + t('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }
        const { error: rpcError } = await window.supabaseClient.rpc('desvincular_wallet');
        if (rpcError) throw rpcError;
        showToast('🔌 Wallet desconectada', 'warning');
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ Error al desconectar wallet: ' + msgError(error), 'error');
    }
}

// ================================================================
// ESCUCHAR CAMBIOS DE CUENTA/RED EN METAMASK
// ================================================================
function iniciarEscuchaWallet() {
    if (typeof window.ethereum === 'undefined') return;

    try {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (perfilCache?.wallet_address) {
                if (!accounts || accounts.length === 0) {
                    showToast('🔌 Wallet desconectada desde MetaMask', 'warning');
                } else if (accounts[0].toLowerCase() !== (perfilCache.wallet_address || '').toLowerCase()) {
                    showToast('🔄 Cuenta cambiada en MetaMask. Vuelve a vincular.', 'warning', 5000);
                }
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            if (perfilCache?.wallet_address && chainId !== ENV.networkChainId) {
                showToast('⚠️ Cambiaste a una red distinta de Polygon Amoy', 'warning', 5000);
            }
        });
    } catch (e) {
        console.warn('[Perfil] No se pudo escuchar wallet:', e);
    }
}