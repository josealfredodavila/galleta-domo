// ================================================================
// PERFIL · WALLET (MetaMask + Polygon Amoy)
// ================================================================
// Conectar/desconectar wallet con MetaMask, cambiar a Polygon Amoy
// y vincular la dirección al perfil del usuario.
// Depende de: perfil-config.js, perfil-utils.js
//
// v3 (hardening):
// - Ya NO usa supabase.rpc('vincular_wallet').
// - Flujo seguro: POST /api/wallet/nonce → personal_sign → POST /api/wallet/link.
// - Desconectar: POST /api/wallet/unlink.
// ================================================================

// Reemplaza {nombre} dentro de una traducción por su valor
function walletTexto(clave, respaldo, vars) {
    let texto = perfilT(clave, respaldo);
    if (vars) {
        Object.keys(vars).forEach(function (nombre) {
            texto = texto.split('{' + nombre + '}').join(String(vars[nombre]));
        });
    }
    return texto;
}

// ================================================================
// HELPERS INTERNOS — flujo seguro de wallet
// ================================================================

function _walletConstruirMensaje(nonce, address) {
    return "Csariel's: vincular wallet\n" +
           "Nonce: " + nonce + "\n" +
           "Dirección: " + address;
}

// ================================================================
// CONECTAR WALLET
// ================================================================
async function conectarWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast(perfilT('perfil_wallet_instalar', '⚠️ Instala MetaMask para conectar tu wallet'), 'error', 5000);
        setTimeout(() => {
            window.open('https://metamask.io/es/download', '_blank', 'noopener,noreferrer');
        }, 800);
        return;
    }

    try {
        const session = await getSession();
        if (!session) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const token = session.access_token || (session.session && session.session.access_token);
        if (!token) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        // 2. Pedir cuentas a MetaMask
        let accounts;
        try {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        } catch (err) {
            if (err.code === 4001) {
                showToast(perfilT('perfil_wallet_cancelado', '❌ Cancelaste la conexión en MetaMask'), 'warning');
            } else {
                showToast(perfilT('perfil_wallet_error_abrir', '❌ Error al abrir MetaMask'), 'error');
            }
            return;
        }
        if (!accounts || accounts.length === 0) {
            showToast(perfilT('perfil_wallet_sin_cuenta', '❌ No se obtuvo ninguna cuenta'), 'error');
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
                        showToast(perfilT('perfil_wallet_error_agregar_red', '❌ No se pudo agregar la red Polygon Amoy'), 'error');
                        return;
                    }
                } else {
                    showToast(perfilT('perfil_wallet_error_cambiar_red', '❌ No se pudo cambiar a Polygon Amoy'), 'error');
                    return;
                }
            }
        }

        // 4. FLUJO SEGURO — pedir nonce al backend
        const nonceResp = await fetch('/api/wallet/nonce', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });

        const nonceJson = await nonceResp.json().catch(() => ({}));

        if (!nonceResp.ok || !nonceJson.nonce) {
            if (nonceResp.status === 401) {
                showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            } else {
                showToast('❌ ' + (nonceJson.error || 'No se pudo iniciar la vinculación'), 'error');
            }
            return;
        }

        const nonce = nonceJson.nonce;

        // 5. Firmar mensaje EXACTO
        const mensaje = _walletConstruirMensaje(nonce, cuenta);

        let signature;
        try {
            signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [mensaje, cuenta]
            });
        } catch (signErr) {
            if (signErr.code === 4001) {
                showToast(perfilT('perfil_wallet_cancelado', '❌ Cancelaste la firma en MetaMask'), 'warning');
            } else {
                showToast(perfilT('perfil_wallet_error_firmar', '❌ Error al firmar el mensaje'), 'error');
            }
            return;
        }

        // 6. Enviar al backend
        const chainIdDecimal = String(parseInt(chainId, 16) || 80002);

        const linkResp = await fetch('/api/wallet/link', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: cuenta,
                nonce: nonce,
                signature: signature,
                chain_id: chainIdDecimal,
                network_name: ENV.networkName
            })
        });

        const linkJson = await linkResp.json().catch(() => ({}));

        if (!linkResp.ok) {
            if (linkResp.status === 409) {
                showToast('⚠️ ' + (linkJson.error || 'Esta wallet ya está vinculada a otra cuenta'), 'warning', 5000);
            } else if (linkResp.status === 401) {
                showToast('❌ ' + (linkJson.error || 'Firma inválida'), 'error');
            } else if (linkResp.status === 400) {
                showToast('⚠️ ' + (linkJson.error || 'Nonce inválido o expirado. Vuelve a intentar.'), 'warning', 5000);
            } else {
                showToast('❌ ' + (linkJson.error || 'Error al vincular wallet'), 'error');
            }
            return;
        }

        showToast(walletTexto('perfil_wallet_conectada', '✅ Wallet conectada a {red}', { red: ENV.networkName }), 'success', 4000);
        await cargarPerfil(true);

    } catch (error) {
        if (error.code === -32002) {
            showToast(perfilT('perfil_wallet_pendiente', '⚠️ MetaMask ya tiene una solicitud pendiente'), 'warning', 5000);
        } else {
            showToast('❌ ' + perfilT('perfil_wallet_error_conectar', 'Error al conectar wallet:') + ' ' + msgError(error), 'error');
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
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const token = session.access_token || (session.session && session.session.access_token);
        if (!token) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        const resp = await fetch('/api/wallet/unlink', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            if (resp.status === 401) {
                showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            } else {
                showToast('❌ ' + (json.error || 'Error al desconectar wallet'), 'error');
            }
            return;
        }

        showToast(perfilT('perfil_wallet_desconectada', '🔌 Wallet desconectada'), 'warning');
        await cargarPerfil(true);
    } catch (error) {
        showToast('❌ ' + perfilT('perfil_wallet_error_desconectar', 'Error al desconectar wallet:') + ' ' + msgError(error), 'error');
    }
}

// ================================================================
// ESCUCHAR CAMBIOS DE CUENTA/RED EN METAMASK
// ================================================================
function iniciarEscuchaWallet() {
    if (typeof window.ethereum === 'undefined') return;

    try {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (perfilCache && perfilCache.wallet_address) {
                if (!accounts || accounts.length === 0) {
                    showToast(perfilT('perfil_wallet_desconectada_mm', '🔌 Wallet desconectada desde MetaMask'), 'warning');
                } else if (accounts[0].toLowerCase() !== (perfilCache.wallet_address || '').toLowerCase()) {
                    showToast(perfilT('perfil_wallet_cuenta_cambiada', '🔄 Cuenta cambiada en MetaMask. Vuelve a vincular.'), 'warning', 5000);
                }
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            if (perfilCache && perfilCache.wallet_address && chainId !== ENV.networkChainId) {
                showToast(walletTexto(
                    'perfil_wallet_red_distinta',
                    '⚠️ Cambiaste a una red distinta de {red}',
                    { red: ENV.networkName }
                ), 'warning', 5000);
            }
        });
    } catch (e) {
        console.warn('[Perfil] No se pudo escuchar wallet:', e);
    }
}