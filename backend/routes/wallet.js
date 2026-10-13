// ================================================================
// ROUTES/WALLET.JS — Sariel's Ecosystem
// Vinculación de wallet con nonce + firma EOA (MetaMask/WalletConnect)
//
// Endpoints:
//   POST /api/wallet/nonce   → genera un nonce efímero (5 min, 1 uso)
//   POST /api/wallet/link    → vincula wallet (verifica nonce + firma)
//   POST /api/wallet/unlink  → desvincula la wallet activa
//
// Base de datos (Supabase):
//   wallet_nonces:     id, usuario_id, nonce, expires_at, usado, creado_en
//   wallet_conexiones: id, usuario_id, wallet_address, chain_id,
//                      network_name, firma_verificacion, activa,
//                      conectada_en, desconectada_en, created_at
//   usuarios:          wallet_address
//
// Reglas de negocio:
//   - Una wallet activa por usuario.
//   - La misma wallet no puede estar en dos cuentas (índice único en DB).
//   - Re-vincular la misma wallet = 200.
//   - El nonce se marca usado ANTES de verificar la firma (anti-replay).
//   - El mensaje firmado es EXACTO (no modificar).
// ================================================================

const express = require('express');
const { ethers } = require('ethers');
const { verificarToken } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

// ================================================================
// HELPERS
// ================================================================

/**
 * Construye el mensaje EXACTO que el frontend debe firmar.
 * NO modificar el formato: debe coincidir byte por byte.
 *
 *   Csariel's: vincular wallet\n
 *   Nonce: <nonce>\n
 *   Dirección: <address>
 */
function construirMensaje(nonce, address) {
    return "Csariel's: vincular wallet\n" +
           "Nonce: " + nonce + "\n" +
           "Dirección: " + address;
}

// ================================================================
// POST /api/wallet/nonce
// ================================================================
router.post('/nonce', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);

        if (!usuarioId) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        const { data, error } = await supabaseAdmin
            .from('wallet_nonces')
            .insert({ usuario_id: usuarioId, usado: false })
            .select('nonce, expires_at')
            .single();

        if (error || !data) {
            console.error('❌ /api/wallet/nonce — error insertando:', error);
            return res.status(500).json({ error: 'Error interno' });
        }

        return res.status(200).json({
            success: true,
            nonce: data.nonce,
            expires_at: data.expires_at
        });
    } catch (error) {
        console.error('❌ /api/wallet/nonce — excepción:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// POST /api/wallet/link
// Body: { address, nonce, signature, chain_id, network_name }
// ================================================================
router.post('/link', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);

        if (!usuarioId) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        const { address, nonce, signature, chain_id, network_name } = req.body || {};

        // 1) Campos requeridos
        if (!address || !nonce || !signature) {
            return res.status(400).json({
                error: 'address, nonce y signature son requeridos'
            });
        }

        // 2) Address válida (ethers v6)
        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Dirección inválida' });
        }

        // 3) Buscar nonce válido
        const ahoraISO = new Date().toISOString();

        const { data: nonceRow, error: nonceErr } = await supabaseAdmin
            .from('wallet_nonces')
            .select('id, nonce')
            .eq('usuario_id', usuarioId)
            .eq('nonce', nonce)
            .eq('usado', false)
            .gt('expires_at', ahoraISO)
            .maybeSingle();

        if (nonceErr) {
            console.error('❌ /link — error consultando nonce:', nonceErr);
            return res.status(500).json({ error: 'Error interno' });
        }

        if (!nonceRow) {
            return res.status(400).json({
                error: 'Nonce inválido, usado o expirado'
            });
        }

        // 4) Verificar que la wallet no esté en OTRA cuenta (lowercase)
        const addressLower = address.toLowerCase();

        const { data: otraCuenta, error: dupErr } = await supabaseAdmin
            .from('usuarios')
            .select('id')
            .ilike('wallet_address', addressLower)
            .neq('id', usuarioId)
            .maybeSingle();

        if (dupErr) {
            console.error('❌ /link — error verificando duplicado:', dupErr);
            return res.status(500).json({ error: 'Error interno' });
        }

        if (otraCuenta && otraCuenta.id) {
            return res.status(409).json({
                error: 'Esta wallet ya está vinculada a otra cuenta'
            });
        }

        // 5) Verificar firma con el mensaje EXACTO
        const mensaje = construirMensaje(nonce, address);

        let recuperada;
        try {
            recuperada = ethers.verifyMessage(mensaje, signature);
        } catch (e) {
            console.warn('⚠️ /link — firma ilegible:', e.message || e);
            return res.status(401).json({ error: 'Firma inválida' });
        }

        if (!recuperada || recuperada.toLowerCase() !== addressLower) {
            return res.status(401).json({
                error: 'Firma no corresponde a la dirección proporcionada'
            });
        }

        // 6) Marcar nonce como usado (CONDICIONAL, anti-replay)
        const { data: marcado, error: markErr } = await supabaseAdmin
            .from('wallet_nonces')
            .update({ usado: true })
            .eq('id', nonceRow.id)
            .eq('usado', false)
            .select('id')
            .maybeSingle();

        if (markErr) {
            console.error('❌ /link — error marcando nonce:', markErr);
            return res.status(500).json({ error: 'Error interno' });
        }

        if (!marcado || !marcado.id) {
            return res.status(400).json({ error: 'Nonce ya consumido' });
        }

        // 7) Guardar wallet_address en usuarios
        const { error: updErr } = await supabaseAdmin
            .from('usuarios')
            .update({ wallet_address: address })
            .eq('id', usuarioId);

        if (updErr) {
            console.error('❌ /link — error guardando wallet_address:', updErr);
            try {
                await supabaseAdmin
                    .from('wallet_nonces')
                    .update({ usado: false })
                    .eq('id', nonceRow.id);
            } catch (revErr) {
                console.warn('⚠️ /link — no se pudo revertir nonce:', revErr.message || revErr);
            }
            return res.status(500).json({ error: 'Error interno' });
        }

        // 8) Actualizar wallet_conexiones
        // a) Desactivar conexiones previas activas
        const { error: deactErr } = await supabaseAdmin
            .from('wallet_conexiones')
            .update({
                activa: false,
                desconectada_en: new Date().toISOString()
            })
            .eq('usuario_id', usuarioId)
            .eq('activa', true);

        if (deactErr) {
            console.warn('⚠️ /link — error desactivando conexiones:', deactErr.message || deactErr);
        }

        // b) Insertar la nueva conexión activa
        const { error: insErr } = await supabaseAdmin
            .from('wallet_conexiones')
            .insert({
                usuario_id: usuarioId,
                wallet_address: address,
                chain_id: chain_id != null ? String(chain_id) : null,
                network_name: network_name || null,
                firma_verificacion: signature,
                activa: true,
                conectada_en: new Date().toISOString()
            });

        if (insErr) {
            console.error('❌ /link — error insertando wallet_conexiones:', insErr);
        }

        return res.status(200).json({
            success: true,
            wallet: address
        });
    } catch (error) {
        console.error('❌ /api/wallet/link — excepción:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// POST /api/wallet/unlink
// ================================================================
router.post('/unlink', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuarioId || (req.usuario && req.usuario.id);

        if (!usuarioId) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        // 1) Limpiar wallet_address del usuario
        const { error: updErr } = await supabaseAdmin
            .from('usuarios')
            .update({ wallet_address: null })
            .eq('id', usuarioId);

        if (updErr) {
            console.error('❌ /unlink — error limpiando wallet_address:', updErr);
            return res.status(500).json({ error: 'Error interno' });
        }

        // 2) Desactivar conexiones activas
        const { error: deactErr } = await supabaseAdmin
            .from('wallet_conexiones')
            .update({
                activa: false,
                desconectada_en: new Date().toISOString()
            })
            .eq('usuario_id', usuarioId)
            .eq('activa', true);

        if (deactErr) {
            console.warn('⚠️ /unlink — error desactivando:', deactErr.message || deactErr);
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ /api/wallet/unlink — excepción:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// ================================================================
// EXPORT
// ================================================================
module.exports = router;