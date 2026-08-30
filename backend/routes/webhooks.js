// ================================================================
// ROUTES/WEBHOOKS.JS
// WEBHOOKS - SARIEL'S BACKEND
// ================================================================

const express = require('express');
const router = express.Router();

const {
    supabaseAdmin
} = require('../config/supabase');

const {
    verificarHMAC
} = require('../utils/encryption');

const {
    limitadorWebhook
} = require('../middleware/rateLimit');

const logger = require('../utils/logger');

// ================================================================
// CONFIGURACIÓN
// ================================================================

const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
if (!IPN_SECRET) {
    console.warn('⚠️ NOWPAYMENTS_IPN_SECRET no configurado. Webhook NOWPayments estará inhabilitado hasta que se defina.');
}

// ================================================================
// NOWPAYMENTS IPN
// ================================================================

router.post(
    '/nowpayments',
    limitadorWebhook,
    async (req, res) => {
        try {
            // ----------------------------------------------------
            // VALIDAR CONFIGURACIÓN EN TIEMPO DE PETICIÓN
            // ----------------------------------------------------
            const secret = process.env.NOWPAYMENTS_IPN_SECRET;
            if (!secret) {
                logger.error('NOWPayments IPN recibido pero NOWPAYMENTS_IPN_SECRET no está configurado');
                return res.status(500).json({ success: false, error: 'Webhook NOWPayments no configurado en servidor' });
            }

            if (!supabaseAdmin) {
                logger.error('NOWPayments IPN recibido pero SUPABASE_SERVICE_ROLE_KEY no está configurada (supabaseAdmin ausente)');
                return res.status(500).json({ success: false, error: 'Servicio interno no configurado: supabaseAdmin ausente' });
            }

            const payload = req.body;

            const firmaRecibida =
                req.headers['x-nowpayments-sig'];

            // ----------------------------------------------------
            // VALIDACIONES BÁSICAS
            // ----------------------------------------------------

            if (!payload || typeof payload !== 'object') {
                logger.warn(
                    'NOWPayments webhook rechazado: payload inválido'
                );

                return res.status(400).json({
                    success: false,
                    error: 'Payload inválido'
                });
            }

            if (!firmaRecibida) {
                logger.warn(
                    'NOWPayments webhook rechazado: falta firma'
                );

                return res.status(401).json({
                    success: false,
                    error: 'Firma requerida'
                });
            }

            // ----------------------------------------------------
            // VERIFICAR FIRMA
            // ----------------------------------------------------

            const firmaValida = verificarHMAC(
                payload,
                firmaRecibida,
                secret
            );

            if (!firmaValida) {
                logger.warn(
                    'NOWPayments webhook rechazado: firma inválida'
                );

                return res.status(401).json({
                    success: false,
                    error: 'Firma inválida'
                });
            }

            logger.info(
                `NOWPayments IPN autenticado. Estado: ${payload.payment_status || 'desconocido'}`
            );

            // ----------------------------------------------------
            // EXTRAER DATOS
            // ----------------------------------------------------

            const ordenId =
                payload.order_id ||
                payload.data?.order_id;

            const paymentId =
                payload.payment_id ||
                payload.data?.payment_id;

            const paymentStatus =
                payload.payment_status ||
                payload.data?.payment_status;

            if (!ordenId) {
                logger.warn(
                    'NOWPayments webhook rechazado: falta order_id'
                );

                return res.status(400).json({
                    success: false,
                    error: 'Falta order_id'
                });
            }

            // ----------------------------------------------------
            // BUSCAR ORDEN
            // ----------------------------------------------------

            const {
                data: orden,
                error: ordenError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .select('*')
                .eq('id', ordenId)
                .single();

            if (ordenError || !orden) {
                logger.error(
                    `Orden NOWPayments no encontrada: ${ordenId}`
                );

                return res.status(404).json({
                    success: false,
                    error: 'Orden no encontrada'
                });
            }

            // ----------------------------------------------------
            // IDEMPOTENCIA
            // ----------------------------------------------------
            // Si ya fue procesada, no volvemos a acreditar nada.

            if (orden.estado === 'completado') {
                logger.info(
                    `NOWPayments: orden ya procesada: ${ordenId}`
                );

                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            // ----------------------------------------------------
            // ESTADOS NO FINALES
            // ----------------------------------------------------

            if (
                paymentStatus &&
                ![
                    'finished',
                    'confirmed'
                ].includes(paymentStatus)
            ) {
                logger.info(
                    `NOWPayments: estado ${paymentStatus} para orden ${ordenId}`
                );

                return res.status(200).json({
                    success: true,
                    message: `Estado recibido: ${paymentStatus}`
                });
            }

            // ----------------------------------------------------
            // CONFIRMACIÓN DEL PAGO
            // ----------------------------------------------------

            const {
                data: ordenActualizada,
                error: updateError
            } = await supabaseAdmin
                .from('pagos_transmision')
                .update({
                    estado: 'completado',
                    pagado_en: new Date().toISOString()
                })
                .eq('id', ordenId)
                .neq('estado', 'completado')
                .select()
                .single();

            if (updateError) {
                logger.error(
                    `Error actualizando orden ${ordenId}: ${updateError.message}`
                );

                throw updateError;
            }

            // ----------------------------------------------------
            // VALIDACIÓN FINAL
            // ----------------------------------------------------

            if (!ordenActualizada) {
                logger.info(
                    `Orden ${ordenId} ya había sido procesada`
                );

                return res.status(200).json({
                    success: true,
                    message: 'Pago ya procesado'
                });
            }

            // ----------------------------------------------------
            // TOKENS
            // ----------------------------------------------------
            //
            // IMPORTANTE:
            // NO acreditamos tokens directamente desde Node.
            //
            // La transferencia/acreditación deberá pasar por
            // una RPC atómica en Supabase.
            //
            // Esto evita:
            //
            // 1. doble acreditación
            // 2. condiciones de carrera
            // 3. saldos inconsistentes
            //
            // La RPC correspondiente se conectará cuando
            // terminemos la migración SQL.

            if (orden.tipo_pago === 'tokens') {
                logger.info(
                    `Orden ${ordenId}: tipo tokens detectado. ` +
                    `Acreditación deberá realizarse mediante RPC atómica.`
                );
            }

            // ----------------------------------------------------
            // REGISTRO
            // ----------------------------------------------------

            logger.info(
                `✅ Pago NOWPayments completado: ${ordenId}` +
                `${paymentId ? ` | payment_id: ${paymentId}` : ''}`
            );

            return res.status(200).json({
                success: true,
                message: 'Pago procesado correctamente'
            });

        } catch (error) {

            logger.error(
                `❌ Error webhook NOWPayments: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error interno procesando webhook'
            });
        }
    }
);

// ================================================================
// WEBHOOK SUPABASE
// ================================================================

router.post(
    '/supabase',
    limitadorWebhook,
    async (req, res) => {
        try {
            const payload = req.body;

            logger.info(
                `Webhook Supabase recibido: ${payload?.table || 'desconocido'}`
            );

            if (
                payload?.table === 'usuarios' &&
                payload?.type === 'INSERT'
            ) {
                logger.info(
                    `Nuevo usuario registrado: ${payload.record?.email || 'sin email'}`
                );
            }

            return res.status(200).json({
                success: true
            });

        } catch (error) {

            logger.error(
                `Error webhook Supabase: ${error.message}`
            );

            return res.status(500).json({
                success: false,
                error: 'Error interno del webhook'
            });
        }
    }
);

// ================================================================
// TEST
// ================================================================

router.get('/test', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Webhook endpoint funcionando',
        timestamp: new Date().toISOString()
    });
});

// ================================================================
// EXPORT
// ================================================================

module.exports = router;
