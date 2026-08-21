// ================================================================
// SERVER.JS - BACKEND DE SARIEL'S CON SUPABASE
// ================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ================================================================
// CLIENTES SUPABASE
// ================================================================

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function clienteDelUsuario(req) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
}

// ================================================================
// MIDDLEWARE
// ================================================================

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, error: 'No autenticado' });
    }
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
        return res.status(401).json({ success: false, error: 'Token inválido' });
    }
    req.userId = data.user.id;
    req.supabase = clienteDelUsuario(req);
    next();
}

function requireAdminSecret(req, res, next) {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_PANEL_SECRET) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
    }
    next();
}

// ================================================================
// RUTAS
// ================================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: 'Supabase',
        version: '2.0.0'
    });
});

// ===== CHAT =====
app.post('/api/chat/message', async (req, res) => {
    const { streamId, userId, userName, message, type, metadata } = req.body;
    if (!streamId || !userId || !message) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    try {
        const { data, error } = await supabaseAdmin
            .from('chat_messages')
            .insert({
                stream_id: streamId,
                user_id: userId,
                user_name: userName || 'Anónimo',
                message,
                type: type || 'text',
                metadata: metadata || {}
            })
            .select();
        if (error) throw error;
        res.json({ success: true, messageId: data[0]?.id });
    } catch (error) {
        console.error('Error guardando mensaje:', error);
        res.status(500).json({ error: 'Error guardando mensaje' });
    }
});

app.get('/api/chat/messages/:streamId', async (req, res) => {
    const { streamId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    try {
        const { data, error } = await supabaseAdmin
            .from('chat_messages')
            .select('*')
            .eq('stream_id', streamId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        res.json({ success: true, messages: data || [] });
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
});

// ===== USUARIO =====
app.get('/api/estado', requireAuth, async (req, res) => {
    const { data, error } = await req.supabase
        .from('usuarios')
        .select('tokens_acumulados, wallet_address, email, telefono, nombre')
        .eq('id', req.userId)
        .single();
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json({
        success: true,
        tokensAcumulados: data.tokens_acumulados || 0,
        progresoCanje: Math.min(Math.round((data.tokens_acumulados || 0) / 12 * 100), 100),
        puedeCanjear: (data.tokens_acumulados || 0) >= 12,
        walletAddress: data.wallet_address,
        email: data.email,
        telefono: data.telefono,
        nombre: data.nombre
    });
});

app.post('/api/domo/comprar', requireAdminSecret, async (req, res) => {
    const { cantidad, metodoPago } = req.body;
    const { data, error } = await supabaseAdmin.rpc('comprar_domo', {
        p_cantidad: cantidad,
        p_metodo_pago: metodoPago
    });
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json(data);
});

app.post('/api/qr/escanear', requireAuth, async (req, res) => {
    const { qrCodigo } = req.body;
    if (!qrCodigo) {
        return res.status(400).json({ success: false, error: 'Falta el código QR' });
    }
    const { data, error } = await req.supabase.rpc('escanear_qr_domo', {
        p_qr_codigo: qrCodigo
    });
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json(data);
});

app.post('/api/nft/canjear', requireAuth, async (req, res) => {
    const { data, error } = await req.supabase.rpc('canjear_nft');
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json(data);
});

app.post('/api/wallet/vincular', requireAuth, async (req, res) => {
    const { walletAddress } = req.body;
    const { data, error } = await req.supabase.rpc('vincular_wallet', {
        p_wallet_address: walletAddress
    });
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json(data);
});

app.get('/api/historial', requireAuth, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await req.supabase
        .from('tokens_historial')
        .select('*', { count: 'exact' })
        .eq('usuario_id', req.userId)
        .order('created_at', { ascending: false })
        .range(from, to);
    if (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
    res.json({
        success: true,
        transactions: data.map(t => ({
            tipo: t.tipo,
            cantidad: t.cantidad,
            fecha: t.created_at
        })),
        pagination: { page, pages: Math.ceil((count || 0) / limit) }
    });
});

// ===== COMPATIBILIDAD =====
app.post('/api/user', async (req, res) => {
    const { wallet } = req.body;
    if (!wallet) {
        return res.status(400).json({ error: 'Wallet requerida' });
    }
    try {
        let { data, error } = await supabaseAdmin
            .from('usuarios')
            .select('*')
            .eq('wallet_address', wallet)
            .maybeSingle();
        if (error) throw error;
        if (!data) {
            const { data: newUser, error: createError } = await supabaseAdmin
                .from('usuarios')
                .insert({ wallet_address: wallet, tokens_acumulados: 0 })
                .select()
                .single();
            if (createError) throw createError;
            data = newUser;
        }
        res.json({ success: true, user: data });
    } catch (error) {
        console.error('Error en /api/user:', error);
        res.status(500).json({ error: 'Error obteniendo usuario' });
    }
});

app.post('/api/user/tokens', async (req, res) => {
    const { wallet, tokens } = req.body;
    if (!wallet || tokens === undefined) {
        return res.status(400).json({ error: 'Wallet y tokens requeridos' });
    }
    try {
        const { error } = await supabaseAdmin
            .from('usuarios')
            .update({ tokens_acumulados: tokens })
            .eq('wallet_address', wallet);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Error en /api/user/tokens:', error);
        res.status(500).json({ error: 'Error actualizando tokens' });
    }
});

app.post('/api/user/canjear', async (req, res) => {
    const { wallet } = req.body;
    if (!wallet) {
        return res.status(400).json({ error: 'Wallet requerida' });
    }
    try {
        const { data, error } = await supabaseAdmin.rpc('canjear_nft');
        if (error) throw error;
        res.json({ success: true, message: 'NFT canjeado exitosamente' });
    } catch (error) {
        console.error('Error en /api/user/canjear:', error);
        res.status(400).json({ success: false, error: error.message || 'Error al canjear' });
    }
});

// ================================================================
// RUTA PRINCIPAL
// ================================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📦 Base de datos: Supabase (${process.env.SUPABASE_URL})`);
});

module.exports = app;