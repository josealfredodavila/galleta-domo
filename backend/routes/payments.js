// backend/routes/payments.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config/config');

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET || config.jwt.secret);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticación requerida' });
    }
};

// ========================================
// CONFIGURACIÓN DE NOWPAYMENTS
// ========================================
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || config.nowpayments.apiKey;
const NOWPAYMENTS_API_URL = config.nowpayments.apiUrl || 'https://api.nowpayments.io/v1';
const NOWPAYMENTS_WEBHOOK_SECRET = process.env.NOWPAYMENTS_WEBHOOK_SECRET || config.nowpayments.webhookSecret;

// ========================================
// RUTA: CREAR PAGO PARA COMPRAR DOMO
// POST /api/payments/create-domo
// ========================================
router.post('/create-domo', auth, async (req, res) => {
    try {
        const { cantidad = 1, moneda = 'MATIC' } = req.body;
        const userId = req.user.userId;

        if (cantidad < 1 || cantidad > 50) {
            return res.status(400).json({ error: 'Cantidad inválida (1-50 domos)' });
        }

        const precioTotal = config.business.precioDomo * cantidad;

        // Crear pago en NowPayments
        const response = await axios.post(
            `${NOWPAYMENTS_API_URL}/payment`,
            {
                price_amount: precioTotal,
                price_currency: 'usd',
                pay_currency: moneda,
                ipn_callback_url: `${process.env.DOMINIO || config.server.dominio}${config.nowpayments.ipnUrl || '/api/payments/webhook'}`,
                order_id: `domo_${userId}_${Date.now()}`,
                order_description: `${cantidad} domo(s) de galleta`,
                success_url: `${process.env.DOMINIO || config.server.dominio}/perfil`,
                cancel_url: `${process.env.DOMINIO || config.server.dominio}/`
            },
            {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            success: true,
            payment: {
                id: response.data.id,
                payment_id: response.data.payment_id,
                pay_address: response.data.pay_address,
                pay_currency: response.data.pay_currency,
                price_amount: response.data.price_amount,
                price_currency: response.data.price_currency,
                order_id: response.data.order_id,
                status: response.data.status,
                created_at: response.data.created_at
            },
            message: 'Pago creado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error creando pago:', error);
        res.status(500).json({
            error: 'Error al crear pago',
            message: error.response?.data?.message || error.message
        });
    }
});

// ========================================
// RUTA: CREAR PAGO PARA TOKENS P2P
// POST /api/payments/create-p2p
// ========================================
router.post('/create-p2p', auth, async (req, res) => {
    try {
        const { tokens, precio, moneda = 'MATIC', vendedorId } = req.body;
        const compradorId = req.user.userId;

        if (!tokens || tokens < 1) {
            return res.status(400).json({ error: 'Cantidad de tokens inválida' });
        }

        if (!precio || precio < 0.01) {
            return res.status(400).json({ error: 'Precio inválido' });
        }

        // Verificar que el vendedor existe
        const vendedor = await User.findById(vendedorId);
        if (!vendedor) {
            return res.status(404).json({ error: 'Vendedor no encontrado' });
        }

        const precioTotal = tokens * precio;

        // Crear pago en NowPayments
        const response = await axios.post(
            `${NOWPAYMENTS_API_URL}/payment`,
            {
                price_amount: precioTotal,
                price_currency: 'usd',
                pay_currency: moneda,
                ipn_callback_url: `${process.env.DOMINIO || config.server.dominio}${config.nowpayments.ipnUrl || '/api/payments/webhook'}`,
                order_id: `p2p_${compradorId}_${vendedorId}_${Date.now()}`,
                order_description: `${tokens} tokens de ${vendedor.nombre}`,
                success_url: `${process.env.DOMINIO || config.server.dominio}/mensajes`,
                cancel_url: `${process.env.DOMINIO || config.server.dominio}/muro`
            },
            {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Guardar transacción pendiente
        // (Se procesará en el webhook)

        res.json({
            success: true,
            payment: {
                id: response.data.id,
                payment_id: response.data.payment_id,
                pay_address: response.data.pay_address,
                pay_currency: response.data.pay_currency,
                price_amount: response.data.price_amount,
                price_currency: response.data.price_currency,
                order_id: response.data.order_id,
                status: response.data.status
            },
            vendedor: {
                _id: vendedor._id,
                nombre: vendedor.nombre
            },
            message: 'Pago P2P creado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error creando pago P2P:', error);
        res.status(500).json({
            error: 'Error al crear pago P2P',
            message: error.response?.data?.message || error.message
        });
    }
});

// ========================================
// RUTA: WEBHOOK DE NOWPAYMENTS
// POST /api/payments/webhook
// ========================================
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-nowpayments-sig'];
        const body = JSON.stringify(req.body);

        // Verificar firma
        if (NOWPAYMENTS_WEBHOOK_SECRET) {
            const expectedSignature = crypto
                .createHmac('sha256', NOWPAYMENTS_WEBHOOK_SECRET)
                .update(body)
                .digest('hex');

            if (signature !== expectedSignature) {
                return res.status(401).json({ error: 'Firma inválida' });
            }
        }

        const { payment_id, order_id, status, pay_amount, pay_currency } = req.body;

        console.log(`📦 Webhook recibido: ${payment_id} - ${status}`);

        // Procesar según el estado del pago
        if (status === 'finished' || status === 'confirmed') {
            // Extraer información del order_id
            const parts = order_id.split('_');
            const tipo = parts[0]; // 'domo' o 'p2p'
            const userId = parts[1];

            if (tipo === 'domo') {
                // Procesar compra de domo
                const cantidad = parseInt(parts[2]) || 1;
                const user = await User.findById(userId);
                if (user) {
                    for (let i = 0; i < cantidad; i++) {
                        user.agregarToken();
                    }
                    await user.save();

                    // Registrar transacción
                    console.log(`✅ ${cantidad} tokens agregados a ${user.nombre}`);
                }
            } else if (tipo === 'p2p') {
                // Procesar transacción P2P
                const vendedorId = parts[2];
                const compradorId = parts[1];

                // Encontrar la transacción pendiente
                // (Se puede almacenar en una colección temporal)

                const comprador = await User.findById(compradorId);
                const vendedor = await User.findById(vendedorId);

                if (comprador && vendedor) {
                    // Aquí se transferirían los tokens
                    // (Integración con Smart Contract)
                    console.log(`🔄 Transferencia P2P: ${vendedor.nombre} → ${comprador.nombre}`);
                }
            }
        }

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error en webhook:', error);
        res.status(500).json({ error: 'Error al procesar webhook' });
    }
});

// ========================================
// RUTA: OBTENER ESTADO DE PAGO
// GET /api/payments/status/:paymentId
// ========================================
router.get('/status/:paymentId', auth, async (req, res) => {
    try {
        const { paymentId } = req.params;

        const response = await axios.get(
            `${NOWPAYMENTS_API_URL}/payment/${paymentId}`,
            {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY
                }
            }
        );

        res.json({
            success: true,
            payment: {
                id: response.data.id,
                payment_id: response.data.payment_id,
                status: response.data.status,
                pay_amount: response.data.pay_amount,
                pay_currency: response.data.pay_currency,
                price_amount: response.data.price_amount,
                price_currency: response.data.price_currency,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo estado de pago:', error);
        res.status(500).json({
            error: 'Error al obtener estado de pago',
            message: error.response?.data?.message || error.message
        });
    }
});

// ========================================
// RUTA: OBTENER MÉTODOS DE PAGO DISPONIBLES
// GET /api/payments/methods
// ========================================
router.get('/methods', async (req, res) => {
    try {
        const response = await axios.get(
            `${NOWPAYMENTS_API_URL}/payment-methods`,
            {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY
                }
            }
        );

        // Filtrar métodos relevantes
        const metodos = response.data.filter(m => 
            ['MATIC', 'USDC', 'USDT', 'ETH', 'BTC', 'LTC'].includes(m.currency)
        );

        res.json({
            success: true,
            methods: metodos.map(m => ({
                id: m.id,
                currency: m.currency,
                name: m.name,
                min_amount: m.min_amount,
                max_amount: m.max_amount
            }))
        });

    } catch (error) {
        console.error('❌ Error obteniendo métodos de pago:', error);
        res.status(500).json({
            error: 'Error al obtener métodos de pago',
            message: error.response?.data?.message || error.message
        });
    }
});

// ========================================
// RUTA: CREAR PAGO PARA COBRO POR ALGORITMO (Muro Live)
// POST /api/payments/live-cobro
// ========================================
router.post('/live-cobro', auth, async (req, res) => {
    try {
        const { streamId, monto, moneda = 'MATIC' } = req.body;
        const userId = req.user.userId;

        const stream = await LiveStream.findById(streamId);
        if (!stream) {
            return res.status(404).json({ error: 'Transmisión no encontrada' });
        }

        if (stream.usuario.toString() !== userId) {
            return res.status(403).json({ error: 'No eres el propietario de esta transmisión' });
        }

        // Crear pago en NowPayments
        const response = await axios.post(
            `${NOWPAYMENTS_API_URL}/payment`,
            {
                price_amount: monto,
                price_currency: 'usd',
                pay_currency: moneda,
                ipn_callback_url: `${process.env.DOMINIO || config.server.dominio}${config.nowpayments.ipnUrl || '/api/payments/webhook'}`,
                order_id: `live_${streamId}_${userId}_${Date.now()}`,
                order_description: `Cobro por algoritmo - ${stream.titulo}`,
                success_url: `${process.env.DOMINIO || config.server.dominio}/live/${streamId}`,
                cancel_url: `${process.env.DOMINIO || config.server.dominio}/muro`
            },
            {
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Registrar cobro
        stream.cobroPorAlgoritmo.totalCobrado += monto;
        await stream.save();

        res.json({
            success: true,
            payment: {
                id: response.data.id,
                payment_id: response.data.payment_id,
                pay_address: response.data.pay_address,
                pay_currency: response.data.pay_currency,
                price_amount: response.data.price_amount,
                status: response.data.status
            },
            message: 'Cobro por algoritmo creado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error creando cobro por algoritmo:', error);
        res.status(500).json({
            error: 'Error al crear cobro por algoritmo',
            message: error.response?.data?.message || error.message
        });
    }
});

// ========================================
// RUTA: HISTORIAL DE PAGOS DEL USUARIO
// GET /api/payments/history
// ========================================
router.get('/history', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 20, page = 1 } = req.query;

        // Obtener transacciones de NowPayments
        const response = await axios.get(
            `${NOWPAYMENTS_API_URL}/payment/list`,
            {
                params: {
                    limit: Math.min(limit, 100),
                    page: page,
                    order_id: `%_${userId}_%`
                },
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY
                }
            }
        );

        res.json({
            success: true,
            payments: response.data,
            pagination: {
                total: response.data.total || response.data.length || 0,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ Error obteniendo historial de pagos:', error);
        res.status(500).json({
            error: 'Error al obtener historial de pagos',
            message: error.response?.data?.message || error.message
        });
    }
});

module.exports = router;