const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { ethers } = require('ethers');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase configuration missing for wallet routes');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Local auth middleware (validates bearer token with Supabase Admin)
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
        const token = authHeader.substring(7).trim();
        if (!token) return res.status(401).json({ error: 'Token no proporcionado' });

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data || !data.user) return res.status(401).json({ error: 'Token inválido o expirado' });

        req.user = data.user;
        req.accessToken = token;
        next();
    } catch (e) {
        console.error('❌ Error authMiddleware (wallet):', e);
        return res.status(401).json({ error: 'No autenticado' });
    }
}

// POST /api/wallet/nonce — crea un nonce para el usuario autenticado
router.post('/nonce', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const nonce = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos

        const { data, error } = await supabaseAdmin
            .from('wallet_nonces')
            .insert({ usuario_id: userId, nonce, usado: false, expires_at: expiresAt })
            .select('id, nonce, expires_at')
            .single();

        if (error) {
            console.error('❌ Error creando nonce:', error);
            return res.status(500).json({ error: 'No fue posible crear nonce' });
        }

        return res.json({ success: true, nonce: data.nonce, expires_at: data.expires_at });
    } catch (error) {
        console.error('❌ /api/wallet/nonce error:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

// POST /api/wallet/link — vincula wallet verificando nonce y firma
router.post('/link', authMiddleware, async (req, res) => {
    try {
        const { address, nonce, signature, chain_id, network_name } = req.body || {};
        if (!address || !nonce || !signature) {
            return res.status(400).json({ error: 'address, nonce y signature son requeridos' });
        }

        let walletAddress;
        try {
            // ethers v6: getAddress normalizes to checksum
            walletAddress = ethers.getAddress(String(address));
        } catch (e) {
            return res.status(400).json({ error: 'Dirección inválida' });
        }

        const userId = req.user.id;

        // Buscar nonce válido (columna 'usado' en español)
        const { data: nonceRow, error: nonceErr } = await supabaseAdmin
            .from('wallet_nonces')
            .select('*')
            .eq('usuario_id', userId)
            .eq('nonce', nonce)
            .eq('usado', false)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        if (nonceErr) {
            console.error('❌ Error consultando nonce:', nonceErr);
            return res.status(500).json({ error: 'Error verificando nonce' });
        }

        if (!nonceRow) {
            return res.status(400).json({ error: 'Nonce inválido, usado o expirado' });
        }

        // MARCAR usado = true ANTES de continuar (previene reutilización)
        const { error: markErr } = await supabaseAdmin
            .from('wallet_nonces')
            .update({ usado: true })
            .eq('id', nonceRow.id);

        if (markErr) {
            console.error('❌ No se pudo marcar nonce como usado:', markErr);
            return res.status(500).json({ error: 'Error interno marcando nonce' });
        }

        // Verificar firma exactamente con el mensaje requerido
        const message = `Csariel's: vincular wallet\nNonce: ${nonce}\nDirección: ${walletAddress}`;

        let recovered;
        try {
            // ethers v6 verifyMessage
            recovered = ethers.verifyMessage(message, signature);
        } catch (e) {
            console.warn('⚠️ Firma inválida:', e.message || e);
            return res.status(401).json({ error: 'Firma inválida' });
        }

        if (!recovered || recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(401).json({ error: 'Firma no corresponde a la dirección proporcionada' });
        }

        // Guardar en usuarios.wallet_address y registrar conexión en wallet_conexiones (si existe)
        const { error: updErr } = await supabaseAdmin
            .from('usuarios')
            .update({ wallet_address: walletAddress })
            .eq('id', userId);

        if (updErr) {
            console.error('❌ Error guardando wallet_address:', updErr);
            return res.status(500).json({ error: 'Error guardando wallet' });
        }

        // Intentar insertar registro en wallet_conexiones (no crítico)
        try {
            await supabaseAdmin.from('wallet_conexiones').insert({
                usuario_id: userId,
                wallet_address: walletAddress,
                chain_id: chain_id || null,
                network_name: network_name || null,
                firma_verificacion: signature,
                activa: true,
                conectada_en: new Date().toISOString()
            });
        } catch (e) {
            // log error but do not interrupt main flow
            console.error('❌ No se pudo registrar wallet_conexiones:', e.message || e);
        }

        return res.json({ success: true, wallet: walletAddress });
    } catch (error) {
        console.error('❌ /api/wallet/link error:', error);
        return res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
