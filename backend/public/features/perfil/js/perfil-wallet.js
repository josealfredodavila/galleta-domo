// ================================================================
// PERFIL · WALLET (Polygon Amoy · WalletConnect + inyectado)
// ================================================================
// Conectar/desconectar wallet y vincular la dirección al perfil.
// - Conectar: usa SarWallet (wallet-connect.js) para elegir la wallet
//   y firmar. Funciona en Chrome Android (WalletConnect) y en
//   escritorio (MetaMask/Coinbase inyectados). Si SarWallet no está
//   disponible, usa window.ethereum como respaldo.
// - Desconectar: cierra la sesión de WalletConnect en el navegador y
//   desvincula la wallet en el servidor (/api/wallet/unlink).
// Depende de: perfil-config.js (ENV), perfil-utils.js (showToast,
// getSession, perfilT, msgError, cargarPerfil) y wallet-connect.js.
//
// v5:
// - conectarWallet usa SarWallet; ya no depende de window.ethereum.
// - desconectarWallet cierra también la sesión de WalletConnect.
// - Listeners de SarWallet (sar:wallet:*) además de los de MetaMask.
// - Exporta window.conectarWallet / desconectarWallet.
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

function _walletSarDisponible() {
    return Boolean(
        window.SarWallet &&
        typeof window.SarWallet.seleccionarConexion === 'function' &&
        typeof window.SarWallet.firmarMensaje === 'function'
    );
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

// Flujo seguro de vinculación: nonce → firma → link.
// `firmar(mensaje, address)` devuelve la firma (SarWallet o window.ethereum).
// Devuelve { ok: true } o { ok: false, status, error, cancelado }.
async function _walletVincular(token, cuenta, chainIdDecimal, firmar) {
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
        signature = await firmar(_walletConstruirMensaje(nonce, cuenta), cuenta);
    } catch (signErr) {
        if (signErr && (signErr.message === 'USER_CANCELLED' || signErr.code === 4001)) {
            return { ok: false, cancelado: true, error: 'Cancelaste la firma en tu wallet' };
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

// Respaldo sin SarWallet: MetaMask de escritorio con window.ethereum.
async function _walletConectarConEthereum() {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
        throw new Error('NO_ACCOUNTS');
    }
    const cuenta = accounts[0];

    const objetivo = _walletChainObjetivo();
    let chainActual = _walletNormalizarChainId(await window.ethereum.request({ method: 'eth_chainId' }));

    if (chainActual !== objetivo) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ENV.networkChainId }]
            });
        } catch (switchError) {
            if (switchError && switchError.code === 4902) {
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
            } else {
                throw switchError;
            }
        }
        chainActual = _walletNormalizarChainId(await window.ethereum.request({ method: 'eth_chainId' }));
    }

    return {
        address: cuenta,
        chainId: chainActual,
        firmar: function (mensaje, address) {
            return window.ethereum.request({
                method: 'personal_sign',
                params: [mensaje, address]
            });
        }
    };
}

// ================================================================
// CONECTAR WALLET
// ================================================================
async function conectarWallet() {
    // 1. Sesión
    let token = null;
    try {
        token = await _walletObtenerToken();
    } catch (_) { token = null; }

    if (!token) {
        showToast('⚠️ ' + perfilT('perfil_inicia_sesion', 'Inicia sesión'), 'error');
        return;
    }

    // 2. Elegir wallet y obtener cuenta + firma
    let conexion = null;

    try {
        if (_walletSarDisponible()) {
            const result = await window.SarWallet.seleccionarConexion();

            // Rainbow en móvil abre su propia app; no hay dirección que vincular aquí.
            if (!result || result.openedApp) return;
            if (!result.address) throw new Error('La wallet no devolvió una dirección.');

            conexion = {
                address: result.address,
                chainId: _walletNormalizarChainId(result.chainId),
                firmar: function (mensaje, address) {
                    return window.SarWallet.firmarMensaje(mensaje, address);
                }
            };
        } else if (typeof window.ethereum !== 'undefined') {
            conexion = await _walletConectarConEthereum();
        } else {
            showToast(perfilT('perfil_wallet_instalar', '⚠️ Abre esta página en tu wallet o conecta con WalletConnect'), 'error', 5000);
            return;
        }
    } catch (error) {
        if (error && (error.message === 'USER_CANCELLED' || error.code === 4001)) {
            showToast(perfilT('perfil_wallet_cancelado', '❌ Cancelaste la conexión'), 'warning');
            return;
        }
        if (error && error.code === -32002) {
            showToast(perfilT('perfil_wallet_pendiente', '⚠️ Tu wallet ya tiene una solicitud pendiente'), 'warning', 5000);
            return;
        }
        showToast('❌ ' + perfilT('perfil_wallet_error_conectar', 'Error al conectar wallet:') + ' ' + msgError(error), 'error');
        return;
    }

    // 3. Vincular (nonce → firma → link)
    try {
        const resultado = await _walletVincular(token, conexion.address, conexion.chainId, conexion.firmar);

        if (!resultado.ok) {
            if (resultado.cancelado) {
                showToast(perfilT('perfil_wallet_cancelado', '❌ Cancelaste la firma'), 'warning');
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
        showToast('❌ ' + perfilT('perfil_wallet_error_conectar', 'Error al conectar wallet:') + ' ' + msgError(error), 'error');
    }
}

// ================================================================
// DESCONECTAR WALLET
// ================================================================
// 1) Cierra la sesión de WalletConnect en el navegador (si existe).
// 2) Desvincula la dirección en el servidor.
async function desconectarWallet() {
    try {
        if (window.SarWallet && typeof window.SarWallet.desconectar === 'function') {
            try { await window.SarWallet.desconectar(); } catch (_) { /* sesión local se limpia igual */ }
        }

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
// ESCUCHAR CAMBIOS EN LA WALLET (una sola vez)
// ================================================================
var _walletListenersRegistrados = false;

function iniciarEscuchaWallet() {
    if (_walletListenersRegistrados) return;
    _walletListenersRegistrados = true;

    // Eventos de SarWallet (wallet-connect.js)
    window.addEventListener('sar:wallet:disconnected', function (ev) {
        const cache = window.perfilCache || {};
        if (!cache.wallet_address) return;
        const motivo = ev && ev.detail ? ev.detail.motivo : null;
        // Si el usuario desconectó desde esta página, ya hay aviso propio.
        if (motivo === 'wallet_se_desconecto') {
            showToast(perfilT('perfil_wallet_desconectada_mm', '🔌 Wallet desconectada desde tu wallet'), 'warning');
        }
    });

    window.addEventListener('sar:wallet:accountsChanged', function (ev) {
        const cache = window.perfilCache || {};
        if (!cache.wallet_address) return;
        const nueva = ev && ev.detail ? ev.detail.address : null;
        if (nueva && String(nueva).toLowerCase() !== String(cache.wallet_address).toLowerCase()) {
            showToast(perfilT('perfil_wallet_cuenta_cambiada', '🔄 Cuenta cambiada en tu wallet. Vuelve a vincular.'), 'warning', 5000);
        }
    });

    window.addEventListener('sar:wallet:wrongNetwork', function () {
        const cache = window.perfilCache || {};
        if (!cache.wallet_address) return;
        showToast(walletTexto(
            'perfil_wallet_red_distinta',
            '⚠️ Cambiaste a una red distinta de {red}',
            { red: ENV.networkName }
        ), 'warning', 5000);
    });

    // Respaldo: MetaMask de escritorio sin SarWallet
    if (!_walletSarDisponible() && typeof window.ethereum !== 'undefined' && window.ethereum.on) {
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
            console.warn('[Perfil] No se pudo escuchar MetaMask:', e);
        }
    }
}

// ================================================================
// EXPORTAR Y ARRANCAR
// ================================================================
window.conectarWallet = conectarWallet;
window.desconectarWallet = desconectarWallet;
window.iniciarEscuchaWallet = iniciarEscuchaWallet;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarEscuchaWallet, { once: true });
} else {
    iniciarEscuchaWallet();
}