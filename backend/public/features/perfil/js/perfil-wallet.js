// ================================================================
// PERFIL · WALLET (MetaMask + Polygon Amoy)
// ================================================================
// Conectar/desconectar wallet con MetaMask, cambiar a Polygon Amoy
// y vincular la dirección al perfil del usuario.
// Depende de: perfil-config.js, perfil-utils.js (ENV, showToast,
// getSession, perfilT, msgError, cargarPerfil).
//
// v4:
// - Emite 'wallet:actualizada' tras vincular/desvincular para que la
//   sección Wallet de perfil.html se repinte sin recargar la página.
// - Un solo flujo de vinculación (nonce → firma → link) para conectar.
// - Comparación de chainId normalizada (hex y decimal).
// - Listeners de MetaMask registrados una sola vez.
// - Usa window.perfilCache, que siempre existe como propiedad de window.
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
// HELPERS INTERNOS
// ================================================================

function _walletConstruirMensaje(nonce, address) {
    return "Csariel's: vincular wallet\n" +
           "Nonce: " + nonce + "\n" +
           "Dirección: " + address;
}

// Acepta "0x13882" (hex) o 80002 / "80002" (decimal). Devuelve string decimal.
function _walletNormalizarChainId(c) {
    if (typeof c === 'string' && /^0x/i.test(c)) {
        const n = parseInt(c, 16);
        return Number.isFinite(n) && n > 0 ? String(n) : '80002';
    }
    const n = Number(c);
    return Number.isFinite(n) && n > 0 ? String(n) : '80002';
}

function _walletChainObjetivo() {
    return _walletNormalizarChainId(ENV.networkChainId);
}

async function _walletObtenerToken() {
    const session = await getSession();
    if (!session) return null;
    return session.access_token || (session.session && session.session.access_token) || null;
}

// Avisa a perfil.html (y a cualquier otro listener) que la wallet cambió.
function _walletNotificarActualizacion() {
    window.dispatchEvent(new Event('wallet:actualizada'));
    if (typeof cargarPerfil === 'function') {
        Promise.resolve()
            .then(function () { return cargarPerfil(true); })
            .catch(function (e) { console.warn('[Perfil] cargarPerfil tras wallet:', e); });
    }
}

// Flujo seguro de vinculación: nonce → personal_sign → link.
// Devuelve { ok: true } o { ok: false, status, error, cancelado }.
async function _walletVincular(token, cuenta, chainIdDecimal) {
    // 1) Nonce del backend
    const nonceResp = await fetch('/api/wallet/nonce', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    });
    const nonceJson = await nonceResp.json().catch(() => ({}));
    if (!nonceResp.ok || !nonceJson.nonce) {
        return {
            ok: false,
            status: nonceResp.status,
            error: nonceJson.error || 'No se pudo iniciar la vinculación'
        };
    }
    const nonce = nonceJson.nonce;

    // 2) Firma del mensaje exacto
    let signature;
    try {
        signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [_walletConstruirMensaje(nonce, cuenta), cuenta]
        });
    } catch (signErr) {
        if (signErr && signErr.code === 4001) {
            return { ok: false, cancelado: true, error: 'Cancelaste la firma en MetaMask' };
        }
        return { ok: false, error: 'Error al firmar el mensaje' };
    }

    // 3) Enviar firma al backend
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
        return {
            ok: false,
            status: linkResp.status,
            error: linkJson.error || 'Error al vincular wallet'
        };
    }
    return { ok: true };
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
        // 1. Sesión
        const token = await _walletObtenerToken();
        if (!token) {
            showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
            return;
        }

        // 2. Cuentas de MetaMask
        let accounts;
        try {
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        } catch (err) {
            if (err && err.code === 4001) {
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

        // 3. Asegurar Polygon Amoy
        const objetivo = _walletChainObjetivo();
        let chainActual = _walletNormalizarChainId(await window.ethereum.request({ method: 'eth_chainId' }));

        if (chainActual !== objetivo) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ENV.networkChainId }]
                });
                chainActual = objetivo;
            } catch (switchError) {
                if (switchError && switchError.code === 4902) {
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
                        chainActual = objetivo;
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

        // 4. Vincular (nonce → firma → link)
        const resultado = await _walletVincular(token, cuenta, chainActual);

        if (!resultado.ok) {
            if (resultado.cancelado) {
                showToast(perfilT('perfil_wallet_cancelado', '❌ Cancelaste la firma en MetaMask'), 'warning');
            } else if (resultado.status === 409) {
                showToast('⚠️ ' + (resultado.error || 'Esta wallet ya está vinculada a otra cuenta'), 'warning', 5000);
            } else if (resultado.status === 401) {
                showToast('❌ ' + (resultado.error || 'Firma inválida'), 'error');
            } else if (resultado.status === 400) {
                showToast('⚠️ ' + (resultado.error || 'Nonce inválido o expirado. Vuelve a intentar.'), 'warning', 5000);
            } else {
                showToast('❌ ' + resultado.error, 'error');
            }
            return;
        }

        showToast(walletTexto('perfil_wallet_conectada', '✅ Wallet conectada a {red}', { red: ENV.networkName }), 'success', 4000);
        _walletNotificarActualizacion();

    } catch (error) {
        if (error && error.code === -32002) {
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
        const token = await _walletObtenerToken();
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
        _walletNotificarActualizacion();

    } catch (error) {
        showToast('❌ ' + perfilT('perfil_wallet_error_desconectar', 'Error al desconectar wallet:') + ' ' + msgError(error), 'error');
    }
}

// ================================================================
// ESCUCHAR CAMBIOS DE CUENTA/RED EN METAMASK (una sola vez)
// ================================================================
var _walletListenersRegistrados = false;

function iniciarEscuchaWallet() {
    if (_walletListenersRegistrados) return;
    if (typeof window.ethereum === 'undefined' || !window.ethereum.on) return;
    _walletListenersRegistrados = true;

    try {
        window.ethereum.on('accountsChanged', function (accounts) {
            const cache = window.perfilCache || {};
            if (!cache.wallet_address) return;

            if (!accounts || accounts.length === 0) {
                showToast(perfilT('perfil_wallet_desconectada_mm', '🔌 Wallet desconectada desde MetaMask'), 'warning');
            } else if (String(accounts[0]).toLowerCase() !== String(cache.wallet_address).toLowerCase()) {
                showToast(perfilT('perfil_wallet_cuenta_cambiada', '🔄 Cuenta cambiada en MetaMask. Vuelve a vincular.'), 'warning', 5000);
            }
        });

        window.ethereum.on('chainChanged', function (chainId) {
            const cache = window.perfilCache || {};
            if (!cache.wallet_address) return;

            if (_walletNormalizarChainId(chainId) !== _walletChainObjetivo()) {
                showToast(walletTexto(
                    'perfil_wallet_red_distinta',
                    '⚠️ Cambiaste a una red distinta de {red}',
                    { red: ENV.networkName }
                ), 'warning', 5000);
            }
        });
    } catch (e) {
        _walletListenersRegistrados = false;
        console.warn('[Perfil] No se pudo escuchar wallet:', e);
    }
}